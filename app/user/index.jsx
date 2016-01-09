"use strict";
import http from 'axios';
import {log, subscribe} from '../journal';

log({
  action: './currentUser',
  data: {
    guest: false,
    _id: null,
    username: 'no user'
  }
});

var user_token = null;
var guest_token = null;

var httpHeaders = {
  Authorization : null
};

// check once at the beginning
isLoggedIn();

/**
 * Checks whether or not there is a user currently logged in by checking window storage
 * for stored tokens. If not it will automatically request a guest user
 * @return {Boolean} true if there is a user logged in.
 */
export function isLoggedIn() {

  if (user_token) {
    log({
      action: './currentUser',
      data: {
        guest: false,
        _id: user_token._id,
        username: user_token.username
      }
    });
    return true;
  }

  if (guest_token) {
    log({
      action: './currentUser',
      data: {
        guest: true,
        _id: guest_token._id,
        username: 'guest'
      }
    });
    return false;
  }


  // check local storage for a user login
  user_token = JSON.parse(window.localStorage.getItem("user_token"));

  if (user_token && user_token.base64) {
    httpHeaders.Authorization = user_token.base64;
    log({
      action: './currentUser',
      data: {
        guest: false,
        _id: user_token._id,
        username: user_token.username
      }
    });
    return true;
  }

  // check session storage for a user login
  user_token = JSON.parse(window.sessionStorage.getItem("user_token"));

  if (user_token && user_token.base64) {
    httpHeaders.Authorization = user_token.base64;
    log({
      action: './currentUser',
      data: {
        guest: false,
        _id: user_token._id,
        username: user_token.username
      }
    });
    return true;
  }

  // check session storage for a guest account
  guest_token = JSON.parse(window.sessionStorage.getItem("guest_token"));

  if (guest_token && guest_token.base64) {
    httpHeaders.Authorization = guest_token.base64;
    log({
      action: './currentUser',
      data: {
        guest: true,
        _id: guest_token._id,
        username: 'guest'
      }
    });
    return false;
  }

  // there is no record of a user or a guest on this computer that could
  // be found. so the only recourse is to request a guest account from the
  // server.
  http.post('/api/user/guest')
  .then(function(res) {

    if (res.data.token) {
      guest_token = res.data.token;
      httpHeaders.Authorization = guest_token.base64;

      // only store guest users in session storage.
      window.sessionStorage.setItem("guest_token", JSON.stringify(guest_token));

      log({
        action: './currentUser',
        data: {
          guest: true,
          _id: guest_token._id,
          username: 'guest'
        }
      });
    }
  })
  .catch(res => {
    log({
      action: './error',
      data: (res.data && res.data.error) || res
    });
  });

  return false;
}

export function register(user) {
  return http.post('/api/user', user)
  .then(res => {
    return res.data;
  })
  .catch(res => {
    log({
      action: './error',
      data: (res.data && res.data.error) || res
    });
  });

};

export function login(user) {

  return http.post('/api/user/token', user)
  .then(function(res) {

    if (res.data.token) {
      user_token = res.data.token;

      httpHeaders.Authorization = user_token.base64;

      log({
        action: './currentUser',
        data: {
          guest: false,
          _id: user_token._id,
          username: user_token.username
        }
      });

      if (user.rememberLogin) {
        window.localStorage.setItem("user_token", JSON.stringify(user_token));
      } else {
        window.sessionStorage.setItem("user_token", JSON.stringify(user_token));
      }

      if (guest_token) {
        return http.post('/api/user/merge', {
          fromToken: guest_token,
          toToken: user_token
        })
        .then(function() {
          guest_token = null;
          window.sessionStorage.removeItem('guest_token');
        })
        .catch(res => {
          log({
            action: './error',
            data: (res.data && res.data.error) || res
          });
        });
      }
    }
  })
  .catch(res => {
    log({
      action: './error',
      data: (res.data && res.data.error) || res
    });
  });
}

log({
  action: './login',
  data: login
});

/**
 * Completely logs user out, removing all stored tokens
 */
export function logout() {
  // logout also functions as complete reset to default values.
  user_token = null;
  guest_token = null;
  window.localStorage.removeItem('user_token');
  window.sessionStorage.removeItem('user_token');
  window.sessionStorage.removeItem('guest_token');
  httpHeaders.Authorization = '';

  log({
    action: './currentUser',
    data: {
      guest: false,
      _id: null,
      username: 'no user'
    }
  });

  // will request a guest account for the remainder of the browser session
  isLoggedIn();
}

log({
  action: './logout',
  data: logout
});