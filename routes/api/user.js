// load dependencies
var express = require('express');
var router = express.Router();
module.exports = router;
var mongoose = require('mongoose');
var userAuth = require('../../middleware/user');
var _ = require('lodash');
var Promise = require('bluebird');

var googleapis = require('googleapis');

var UsersError = require('../../error')('routes.api.users');

var zxcvbn = require('zxcvbn');
var bodyParser = require('body-parser');
router.use(bodyParser.json());
router.use(bodyParser.urlencoded({
  extended: false
}));

// use mongoose database objects
var User = mongoose.model("user");

var email_regex = /[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:[A-Z]{2}|com|org|net|gov|mil|biz|info|mobi|name|aero|jobs|museum)\b/;

var username_regex = /^[a-zA-Z0-9]{3,20}([._]?[a-zA-Z0-9]{3,20})*$/;


// TODO: have to set this from database values
var oauth2Client = new googleapis.auth.OAuth2(
  '227454360184-kk55m7mdg9blkgnkd7pmuhs3d20kh806.apps.googleusercontent.com',
  'NP53QGYunsiy33xfvF1IeUu5',
  'http://localhost:3000/api/user/google/auth/callback');

// creates a new user
router.post('/', function(req, res, next) {
  try {

    if (!req.body.username || !username_regex.test(req.body.username)) {
      throw new UsersError('nousername',
        'A username must be supplied to register a new user.', [],
        400);
    }

    if (!req.body.password || req.body.password === '') {
      throw new UsersError('nopassword',
        'A password must be supplied to register a new user.', [],
        400);
    }

    var password_result = zxcvbn(req.body.password);

    if (password_result.score < 3) {
      throw new UsersError('insecurepassword',
        'The password supplied scored [0]/4 for security. A minimum of 3/4 is required.', [password_result.score],
        400);
    }

    var username = '' + req.body.username;
    var password = '' + req.body.password;
    var locale = '' + req.body.locale || 'en-US';

    User.findOne({
        "signin.username": username
      })
      .then(function(user) {
        if (user) {
          throw new UsersError('inuse',
            'The username [0] is already in use by another user.', [username],
            400);
        }
      })
      .then(function() {
        var newuser = new User({
          created: Date.now(),
          locale: locale,
          signin: {
            username: username
          }
        });

        return newuser.setPassword(password);
      })
      .then(function(user) {
        if (!user) {
          throw new UsersError('internal',
            'An error has occured while setting the password.', [],
            500);
        }

        return user;
      })
      .then(function(user) {
        return res.status(201).json({
          _id: user._id,
          created: user.created,
          signin: user.signin,
          locale: user.locale,
          email: user.email,
          groups: user.groups
        });
      }, function(error) {
        next(error);
      });

  } catch (error) {
    next(error);
  }
});


router.get('/registered/:username(*)', function(req, res, next) {

  try {

    if (!req.params.username) {
      res.status(200).json({
        registered: false
      });
      return;
    }

    User.findOne({
        "signin.username": '' + req.params.username
      }).exec()
      .then(function(user) {
        if (!user) {
          res.status(200).json({
            registered: false
          });
        } else {
          res.status(200).json({
            registered: true
          });
        }
      })
      .catch(function(error) {
        next(error);
      })
  } catch (error) {
    next(error);
  }
});

router.get('/:id', userAuth(), function(req, res, next) {

  try {

    User.findById(req.params.id)
      .then(function(user) {

        if (!user || !user._id.equals(req.user._id)) {
          // user can only get their own details for now
          throw new UsersError('nouser',
            'User not found.', [],
            404);
        }

        res.send({
          _id: user._id,
          created: user.created,
          signin: user.signin,
          locale: user.locale,
          email: user.email,
          groups: user.groups
        });
      })
      .catch(function(error) {
        next(error);
      });
  } catch (error) {
    next(error);
  }
});

// creates a new guest user
router.post('/guest', function(req, res, next) {
  try {

    var new_user = new User({
      created: Date.now(),
      signin: {
        guest: true
      }
    });

    new_user.generateGuestToken()
      .then(function(token) {
        res.json({
          token: token
        });
      })
      .catch(function(error) {
        next(error);
      });

  } catch (error) {
    next(error);
  }
});



router.post('/merge', userAuth(), function(req, res, next) {
  try {
    var fromUser = null;
    var toUser = null;

    User.findById(req.body.fromToken._id).exec()
      .then(function(user) {
        if (!user) {
          throw new UsersError('nouser',
            'From user not found.', [],
            404);
        }

        if (!user.signin.guest) {
          throw new UsersError('notguest',
            'Only a guest account may be merged with another account.', [],
            403);
        }

        return user.verifyToken(req.body.fromToken);
      }).then(function(user) {
        fromUser = user;
        return User.findById(req.body.toToken._id).exec()
      })
      .then(function(user) {
        if (!user) {
          throw new UsersError('nouser',
            'To user not found.', [],
            404);
        }

        return user.verifyToken(req.body.toToken);
      }).then(function(user) {
        toUser = user;

        if (!fromUser || !toUser) {
          throw new UsersError('unauthorized',
            'Merge failed because it is not authorized.', [],
            401);
        }

        // merge by changing all ownerships and/or references?
        //
        if (fromUser.accessRecords) {

          var promises = [];

          for (var model in fromUser.accessRecords) {
            fromUser.accessRecords[model].id.forEach(function(_id, fromIndex) {
              var actions = fromUser.accessRecords[model].actions[fromIndex];

              promises.push(mongoose.model(model).findById(_id).exec()
                .then(function(element) {
                  return element.revokeUserAccess(actions, fromUser).return(element.grantUserAccess(actions, toUser));
                }));
            });
          }

          return Promise.all(promises)
            .then(function() {
              return fromUser.remove();
            })
        } else {
          return fromUser.remove();
        }
      })
      .then(function() {
        res.json({});
      })
      .catch(function(error) {
        next(error);
      });
  } catch (error) {
    next(error);
  }
});



// generates a new token
router.post('/token', userAuth(), function(req, res, next) {

  try {
    if (!req.user || !req.body.password) {
      // TODO: this message doesn't seem right here. it shouldn't know why user is not authenticated
      throw new UsersError('nouser',
        'The username and password combination provided are not valid.', [],
        401);
    }

    req.user.generateToken('' + req.body.password)
      .then(function(token) {
        res.json({
          token: token
        });
      })
      .catch(function(error) {
        next(error);
      }).done();
  } catch (error) {
    next(error);
  }
});

// invalidates all tokens.
router.post('/token/reset', userAuth(), function(req, res, next) {
  try {
    if (!req.user || !req.body.password) {
      throw new UsersError('nouser',
        'The username and password combination provided are not valid.', [],
        401);
    }

    req.user.resetTokens('' + req.body.password)
      .then(function(user) {
        res.status(201).json({
          _id: user._id
        });
      }, function(error) {
        next(error);
      });
  } catch (error) {
    next(error);
  }
});



router.get('/records/', userAuth(), function(req, res, next) {
  try {
    if (!req.user) {
      throw new UsersError('nouser',
        'A user must be logged in to see their records.', [],
        401);
    }


    res.send(req.user.accessRecords);
  } catch (error) {
    next(error);
  }
});

router.get('/records/:model', userAuth(), function(req, res, next) {
  try {
    if (!req.user) {
      throw new UsersError('nouser',
        'A user must be logged in to see their records.', [],
        401);
    }


    res.send(req.user.accessRecords[req.params.model]);
  } catch (error) {
    next(error);
  }
});

var scopes = [
  'https://www.googleapis.com/auth/plus.me'
];

var oauthURL = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: scopes.join(" ") // space delimited string of scopes
});

// returns an authorization url that will then provide a code exchangable for a token
router.get('/google/auth/url', function(req, res, next) {
  try {
    res.send({
      url: oauthURL
    });
  } catch (error) {
    next(error);
  }
});


// TODO: I think there might be a security risk by sending the code to the callback
// I think instead they should supply some information about who should be logged in
// as this person.
router.get('/google/auth/callback', function(req, res, next) {
  try {
    if (req.query.error) {
      res.render('googleCallback', {
        error: req.query.error,
        code: ''
      });
    } else {
      res.render('googleCallback', {
        error: '',
        code: req.query.code
      });
    }

  } catch (error) {
    next(error);
  }
});
// sets the google access token from a code, and returns a local login token
router.post('/google/auth/token', function(req, res, next) {

  try {

    oauth2Client.getToken(req.body.code, function(err, tokens) {
      // contains an access_token and optionally a refresh_token.
      // save them permanently.
      //
      oauth2Client.setCredentials(tokens);

      googleapis
        .plus('v1').people.get({
          userId: 'me',
          auth: oauth2Client
        }, function(err, person) {

          if (err) {
            return next(err);
          }

          User.findOne({
            'signin.google': person.id
          }).exec()
          .then(function(user) {

            if (!user) {
              user = new User({
                created: Date.now(),
                signin: {
                  'google': person.id
                }
              });
            }

            return user.generateTokenFromOauthToken(tokens.access_token);
          })
          .then(function(token) {
            res.json({
              token: token
            });
          })
          .catch(function(error) {
            next(error);
          });
        });

    });

  } catch (error) {
    next(error);
  }
});

router.get('/facebook/auth/url', function(req, res, next) {
  try {
    var url = [
      'https://www.facebook.com/dialog/oauth?client_id=',
      '576071689221966',
      '&amp;redirect_uri=',
      ''
    ].join('');
    res.send({
      url: url
    });
  } catch (error) {
    next(error);
  }
});

router.get('/facebook/auth/callback', function(req, res, next) {
  try {
    if (req.query.error) {
      res.render('facebookCallback', {
        error: req.query.error,
        code: ''
      });
    } else {
      res.render('facebookCallback', {
        error: '',
        code: req.query.code
      });
    }

  } catch (error) {
    next(error);
  }
});

// update the sign-in
router.post('/:id', userAuth(), function(req, res, next) {
  try {

    if (!req.user) {
      throw new UsersError('nouser',
        'User not found.', [],
        404);
    }

    if (req.body.username && req.body.password) {

      if (!req.body.username || !username_regex.test(req.body.username)) {
        throw new UsersError('nousername',
          'A username must be supplied to register a new user.', [],
          400);
      }

      if (!req.body.password || req.body.password === '') {
        throw new UsersError('nopassword',
          'A password must be supplied to register a new user.', [],
          400);
      }

      var password_result = zxcvbn(req.body.password);

      if (password_result.score < 3) {
        throw new UsersError('insecurepassword',
          'The password supplied scored [0]/4 for security. A minimum of 3/4 is required.', [password_result.score],
          400);
      }

      var username = '' + req.body.username;
      var password = '' + req.body.password;

      if (req.user.signin.username === username) {
        req.user.setPassword(password)
          .then(function(user) {
            if (!user) {
              throw new UsersError('internal',
                'An error has occured while setting the password.', [],
                500);
            }

            return user;
          })
          .then(function(user) {
            return res.status(201).json({
              _id: user._id
            });
          }, function(error) {
            next(error);
          });
      } else {

        User.findOne({
            "signin.username": username
          })
          .then(function(user) {
            if (user) {
              throw new UsersError('inuse',
                'The username [0] is already in use by another user.', [username],
                400);
            }
          })
          .then(function() {

            req.user.signin = {
              username: username
            };

            return req.user.setPassword(password);
          })
          .then(function(user) {
            if (!user) {
              throw new UsersError('internal',
                'An error has occured while setting the password.', [],
                500);
            }

            return user;
          })
          .then(function(user) {
            return res.status(201).json({
              _id: user._id
            });
          }, function(error) {
            next(error);
          });
      }
    }else if(req.body.googleCode) {

      oauth2Client.getToken(req.body.code, function(err, tokens) {
        // contains an access_token and optionally a refresh_token.
        // save them permanently.
        //
        oauth2Client.setCredentials(tokens);

        googleapis.plus('v1').people.get({
          userId: 'me',
          auth: oauth2Client
        }, function(err, person) {

          if (err) {
            return next(err);
          }

          User.findOne({
            'signin.google': person.id
          }).exec()
          .then(function(user) {

            if (user) {
              throw new UsersError('inuse',
                'The google account is already in use by another user.', [],
                400);
            }

            req.user.signin = {
              'google': person.id
            };

            return req.user.save();
          })
          .then(function(user) {
            return res.status(201).json({
              _id: user._id
            });
          })
          .catch(function(error) {
            next(error);
          });
        });

      });
    }

  } catch (error) {
    next(error);
  }
});
