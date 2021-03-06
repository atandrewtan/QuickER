/**
 *
 * HospitalLoginForm
 *
 */

import React from 'react';
import TextField from '@material-ui/core/TextField';
import Button from '@material-ui/core/Button';
import FormControl from '@material-ui/core/FormControl';
import Card from '@material-ui/core/Card';

import PropTypes from 'prop-types';
// import styled from 'styled-components';

/* eslint-disable react/prefer-stateless-function */
class HospitalLoginForm extends React.PureComponent {
  render() {
    return (
      <Card className="card-login">
        <FormControl required className="hospital-login-form-input">
          <TextField
            id="username"
            label="Username"
            type="text"
            className=""
            margin="normal"
            onChange={this.props.handleInputChange('username')}
            onKeyDown={this.props.onKeyPressFunc}
          />
          <TextField
            id="password"
            label="Password"
            type="password"
            className=""
            margin="normal"
            onChange={this.props.handleInputChange('password')}
            onKeyDown={this.props.onKeyPressFunc}
          />
          <Button
            variant="contained"
            className="full-width"
            onClick={this.props.onLogin()}
          >
            Login
          </Button>
        </FormControl>
      </Card>
    );
  }
}

HospitalLoginForm.propTypes = {
  onLogin: PropTypes.func,
};

export default HospitalLoginForm;
