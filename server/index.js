/* eslint consistent-return:0 import/order:0 */

const { api } = require('./api');
const auth = require('./auth');
const mongoose = require('mongoose');
const express = require('express');
const logger = require('./logger');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const session = require('express-session');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const { Hospital, User, ScrapedClinic, Patient } = require('../models/models');
const bcrypt = require('bcrypt');

const argv = require('./argv');
const port = require('./port');
const setup = require('./middlewares/frontendMiddleware');
const isDev = process.env.NODE_ENV !== 'production';
const ngrok =
  (isDev && process.env.ENABLE_TUNNEL) || argv.tunnel
    ? require('ngrok')
    : false;
const { resolve } = require('path');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);

const accountSid = 'ACe275517637075b7fb777f44f7b549efc';
const authToken = process.env.TWILIO_TOKEN;
const twilioClient = require('twilio')(accountSid, authToken);

app.use(
  session({
    secret: 'crypto kittens',
    resave: false,
    saveUninitialized: true,
    // TODO set this to true for final realease cookie: { secure: true },
  }),
);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

mongoose.createConnection(process.env.MONGODB_URI);
mongoose.connection.on('connected', () => {
  console.log('we connected to mongoDB!');
});

// Do passport and session setup here

app.use(bodyParser.json());
app.use(cookieParser());

passport.serializeUser((user, done) => {
  done(null, user._id);
});

passport.deserializeUser((id, done) => {
  User.findById(id, (err, user) => {
    done(err, user);
  });
});

// http://www.passportjs.org/docs/authenticate/
passport.use(
  new LocalStrategy(
    { passReqToCallback: true },
    (req, username, password, done) => {
      // TODO take the userType as a param, can use that to seperate the users in db
      User.findOne({ username }, (err, user) => {
        if (err) {
          return done(err);
        }
        if (!user) {
          return done(null, false, { message: 'Incorrect username.' });
        }
        if (bcrypt.compareSync(password, user.password)) {
          if (user.usertype !== req.body.usertype) {
            return done(null, false, { message: 'Wrong usertype' });
          }
          return done(null, user);
        }
        return done(null, false, { message: 'Incorrect password.' });
      });
    },
  ),
);

io.on('connection', client => {
  client.on('join', clinic => {
    client.join(clinic);
    client.currentRoom = clinic;
  });

  client.on('disconnect', () => {
    client.leave(client.currentRoom);
  });

  client.on('forwardPatient', data => {
    client.broadcase.to(client.currentRoom).emit('forwardPatient', data);
  });
});

// Attach the io instance to the app
app.io = io;

app.post('/patient', (req, res) => {
  const newPatient = new Patient({
    firstname: req.body.firstname,
    lastname: req.body.lastname,
    DOB: req.body.DOB,
    phone: req.body.phone,
    hospitalName: req.body.hospitalName,
  });

  newPatient.save().then(savedUser => {
    ScrapedClinic.update(
      { _id: req.body.clinicId },
      {
        $push: { incomingRequests: savedUser._id },
      },
    ).then(updatedClinic => {
      // Forward the new patient to the clinic via socket
      req.app.io.to(req.body.clinicId).emit('forwardPatient', savedUser);
      // If a phone number is provided, send a text message to the client
      if (req.body.phone && req.body.phone.length) {
        ScrapedClinic.findById(req.body.clinicId).then(clin => {
          let clientNumber = req.body.phone;
          if (clientNumber.length === 10) {
            clientNumber = `1${clientNumber}`;
          }
          clientNumber = `+${clientNumber}`;

          twilioClient.messages
            .create({
              body: `Hi ${
                req.body.firstname
              }, your request was successfully sent to ${
                clin.name
              }. You will receieve another notification once your status has been confirmed by the clinic`,
              to: clientNumber,
              messagingServiceSid: 'MG2df860e11a20b54a5deca683e7e83a01',
            })
            .then(message => {
              console.log(message);
            });
        });
      }

      res.json({
        error: null,
        response: updatedClinic,
      });
    });
  });
});

app.use(passport.initialize());
app.use(passport.session());

// If you need a backend, e.g. an API, add your custom backend-specific middleware here
app.use('/', auth(passport));
app.use('/api', api);

// Ensure that the user is logged in before accessing the hospital and clinic pages
app.get('/hospital/*', (req, res, next) => {
  if (req.user && req.user.usertype === 'hospital') {
    next();
  } else {
    res.redirect('/');
  }
});

app.get('/clinic/*', (req, res, next) => {
  if (req.user && req.user.usertype === 'clinic') {
    next();
  } else {
    res.redirect('/');
  }
});

// In production we need to pass these values in instead of relying on webpack
setup(app, {
  outputPath: resolve(process.cwd(), 'build'),
  publicPath: '/',
});

// get the intended host and port number, use localhost and port 3000 if not provided
const customHost = argv.host || process.env.HOST;
const host = customHost || null; // Let http.Server use its default IPv6/4 host
const prettyHost = customHost || 'localhost';

// use the gzipped bundle
app.get('*.js', (req, res, next) => {
  req.url = req.url + '.gz'; // eslint-disable-line
  res.set('Content-Encoding', 'gzip');
  next();
});

// Start your app.
server.listen(port, host, async err => {
  if (err) {
    return logger.error(err.message);
  }

  // Connect to ngrok in dev mode
  if (ngrok) {
    let url;
    try {
      url = await ngrok.connect(port);
    } catch (e) {
      return logger.error(e);
    }
    logger.appStarted(port, prettyHost, url);
  } else {
    logger.appStarted(port, prettyHost);
  }
});
