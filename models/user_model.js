"use strict";
// TODO: this file is a brainstorm to improve the apifactory. however, it is non-functional

var fs = require('fs');
var path = require('path');
var formidable = require('formidable');
var error = require('../error');
var Promise = require('bluebird');
var mongoose = require('mongoose');
var crypto = require('crypto');
var _ = require('lodash');

var bcrypt_hash = Promise.promisify(bcrypt.hash);
var bcrypt_genSalt = Promise.promisify(bcrypt.genSalt);
var bcrypt_compare = Promise.promisify(bcrypt.compare);
var crypto_pbkdf2 = Promise.promisify(crypto.pbkdf2);

var ModelError = error('routes.api.user');

// TODO: have to set this from database values
var oauth2Client = new googleapis.auth.OAuth2(
    '227454360184-kk55m7mdg9blkgnkd7pmuhs3d20kh806.apps.googleusercontent.com',
    'NP53QGYunsiy33xfvF1IeUu5',
    'http://localhost:3000/api/user/google/auth/callback');

var scopes = [
    'https://www.googleapis.com/auth/plus.me'
];

var oauthURL = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes.join(" ") // space delimited string of scopes
});

module.exports = {
    user : {
        state : { // this is what will be stored in the database specific to each resource
            independent : { // what can be set directly

            },
            dependent : { // what is set indirectly according to the api
                created: Number,
                username : String,
                passwordHash: {type : String, default : ''},
                secretSalt : {type : String, default : ''},
                tokenSalt : {type : String, default : ''},
                tokenHash : {type : String, default : ''},

                // store credentials to use google services for this user
                google : {
                    id : String
                },
                facebook : {
                    id : String
                },
                groups : [String],
                accessRecords : mongoose.Schema.Types.Mixed
            },
            index : null, // used for text searches
        },
        create: {
            creatorAccess: ['root'],
            handler : function(req, res){
                if (!req.body.username || req.body.username === '') {
                    throw new UsersError('nousername',
                        'A username must be supplied to register a new user.',
                        [],
                        400);
                }

                if (!req.body.password || req.body.password === '') {
                    throw new UsersError('nopassword',
                        'A password must be supplied to register a new user.',
                        [],
                        400);
                }

                var password_result = zxcvbn(req.body.password);

                if (password_result.score < 3) {
                    throw new UsersError('insecurepassword',
                        'The password supplied scored {0}/4 for security. A minimum of 3/4 is required.',
                        [password_result.score],
                        400);
                }

                var username = '' + req.body.username;
                var password = '' + req.body.password;

                return User.findOne({username : username})
                .then(function(user){
                    if (user) {
                        throw new UsersError('inuse',
                            'The username {0} is already in use by another user.',
                            [username],
                            400);
                    }
                })
                .then(function(){
                    var newuser = new User({
                        created : Date.now(),
                        username : username
                    });

                    return newuser.setPassword(password);
                });
            }
        },
        get : {
            secure : true
        },
        update : {
            secure : true
        },
        static : {
            guest : {
                token : {
                    POST : {
                        handler : function(req, res){
                            var new_user = new mongoose.model('user')({
                                created : Date.now()
                            });

                            return new_user.generateGuestToken()
                            .then(function(token){
                                res.json({token: token});
                            })
                        }
                    }
                }
            },
            merge : {
                POST : {
                    handler : function(req, res) {
                        var fromUser = null;
                        var toUser = null;

                        return mongoose.model('user').findById(req.body.fromToken._id).exec()
                        .then(function(user){
                            if (!user) {
                                throw new ModelError('nouser',
                                    'From user not found.',
                                    [],
                                    404);
                            }

                            if (!user.isGuest()) {
                                throw new ModelError('notguest',
                                    'Only a guest account may be merged with another account.',
                                    [],
                                    403);
                            }

                            return user.verifyToken(req.body.fromToken);
                        }).then(function(user){
                            fromUser = user;
                            return User.findById(req.body.toToken._id).exec()
                        })
                        .then(function(user){
                            if (!user) {
                                throw new ModelError('nouser',
                                    'To user not found.',
                                    [],
                                    404);
                            }

                            return user.verifyToken(req.body.toToken);
                        }).then(function(user){
                            toUser = user;

                            if (!fromUser || !toUser) {
                                throw new ModelError('unauthorized',
                                    'Merge failed because it is not authorized.',
                                    [],
                                    401);
                            }

                            // merge by changing all ownerships and/or references?
                            //
                            if (fromUser.accessRecords) {

                                var promises = [];

                                for(var model in fromUser.accessRecords){
                                    fromUser.accessRecords[model].id.forEach(function(_id, fromIndex){
                                        var actions = fromUser.accessRecords[model].actions[fromIndex];

                                        promises.push(mongoose.model(model).findById(_id).exec()
                                        .then(function(element){
                                            return element.revokeUserAccess(actions, fromUser).return(element.grantUserAccess(actions, toUser));
                                        }));
                                    });
                                }

                                return Promise.all(promises)
                                .then(function(){
                                    return fromUser.remove();
                                })
                            }else{
                                return fromUser.remove();
                            }
                        });
                    }
                }
            },
            token : {
                POST : {
                    handler : function(req, res) {
                        if (!req.user || !req.body.password) {
                            // TODO: this message doesn't seem right here. it shouldn't know why user is not authenticated
                            throw new ModelError('nouser',
                                'The username and password combination provided are not valid.',
                                [],
                                401);
                        }



                        return req.user.generateToken('' + req.body.password);
                    }
                },
                reset : {
                    POST : {
                        handler : function(req, res){
                            if (!req.user || !req.body.password) {
                                throw new ModelError('nouser',
                                    'The email and password combination provided are not valid.',
                                    [],
                                    401);
                            }

                            return req.user.resetTokens('' + req.body.password)
                        }
                    }
                }
            },
            registered : {
                GET : {
                    parameter : ':username',
                    handler : function(req, res) {
                        User.findOne({
                            username : '' + req.params.username
                        }).exec()
                        .then(function(user){
                            if(!user){
                                res.status(200).json({registered : false});
                            }else{
                                res.status(200).json({registered : true});
                            }
                        })
                    }
                }
            },
            google : {
                auth : {
                    url : {
                        GET : {
                            handler : function(req, res) {
                                return oauthURL;
                            }
                        }
                    },
                    callback : {
                        GET : {
                            handler : function(req, res) {
                                if (req.query.error){
                                    res.render('googleCallback', { error: req.query.error, code : '' });
                                }else{
                                    res.render('googleCallback', { error: '', code : req.query.code });
                                }
                            }
                        }
                    },
                    token : {
                        POST : {
                            handler : function(req, res){

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

                                            if (err){
                                                return next(err);
                                            }

                                            User.findOne({
                                                    'google.id': person.id
                                                }).exec()
                                                .then(function(user) {

                                                    if (!user) {
                                                        user = new User({
                                                            created: Date.now(),
                                                            username: person.displayName,
                                                            google: {
                                                                id : person.id
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
                            }
                        }
                    }
                }
            }
        },
        // only accessible on the server
        internal : {
            isGuest : function() {
                // there is no password so this is a guest account.
                return this.passwordHash === '';
            },
            setPassword : function(new_password) {
                var user = this;

                return bcrypt_hash(new_password, 10)
                    .then(function(hash) {

                        user.passwordHash = hash;

                        // reset tokens because password changed
                        return user.resetTokens(new_password);
                    });
            },
            resetTokens : function(password) {
                var user = this;

                // the tokens valididy are limited by a secret which can be changed any time,
                // and by a time limit even on otherwise valid secrets.
                user.tokenSalt = crypto.randomBytes(16).toString('hex');

                // this salt is to make sure the password hash cannot be used to generate a secret without the password
                return bcrypt_genSalt(10)
                    .then(function(secretSalt){

                        user.secretSalt = secretSalt;

                        // this hash is to make cracking the password from the secret harder, although
                        // the secret should neven be seen, but just in case. it's slow but only needed
                        // when creating a token, not verifying. This is so all tokens are the same (given the salt), and
                        // can only be generated if the user knows their password
                        return bcrypt_hash(password, secretSalt);
                    })
                    .then(function(secret) {

                        // this is to ensure the token value in the database cannot be used to generate a secret
                        // a faster hash is used for verification only.
                        return crypto_pbkdf2(secret, user.tokenSalt, 1000, 64, 'sha256');
                    })
                    .then(function(tokenHash){
                        user.tokenHash = tokenHash.toString('hex');

                        return user.save();
                    });
            },
            verifyPassword : function(password) {
                var user = this;

                return (new Promise(function (resolve, reject) {
                        try {

                            if (user.passwordHash === '') {
                                throw new Error('password is not set');
                            }

                            resolve();
                        }catch(e) {
                            reject(e);
                        }
                    }))
                    .then(function(){
                        return bcrypt_compare(password, user.passwordHash);
                    })
                    .then(function(valid){
                        if (valid) {
                            return user;
                        }

                        return null;
                    });

            },
            generateToken : function(password) {
                var user = this;

                return bcrypt_hash(password, user.secretSalt)
                    .then(function(secret){
                        var token = {
                            username : user.username,
                            _id : user._id,
                            secret : secret
                        };

                        // this enocding is for use in header authorization.
                        token.base64 = (new Buffer(JSON.stringify(token), 'utf8')).toString('base64');

                        return token;
                    });

            },
            generateGuestToken : function() {
                var guest = this;
                guest.tokenSalt = crypto.randomBytes(16).toString('hex');
                var secret = crypto.randomBytes(16).toString('hex');

                return crypto_pbkdf2(secret, guest.tokenSalt, 1000, 64, 'sha256')
                    .then(function(tokenHash){
                        guest.tokenHash = tokenHash.toString('hex');

                        return guest.save();
                    })
                    .then(function(guest){
                        var token = {
                            _id : guest._id,
                            secret : secret
                        };

                        // this enocding is for use in header authorization.
                        token.base64 = (new Buffer(JSON.stringify(token), 'utf8')).toString('base64');

                        return token;
                    });
            },
            generateTokenFromOauthToken : function(oauthToken) {
                var user = this;
                user.tokenSalt = crypto.randomBytes(16).toString('hex');
                var secret = oauthToken;

                return crypto_pbkdf2(secret, user.tokenSalt, 1000, 64, 'sha256')
                    .then(function(tokenHash){
                        user.tokenHash = tokenHash.toString('hex');

                        return user.save();
                    })
                    .then(function(user){
                        var token = {
                            username : user.username,
                            _id : user._id,
                            secret : secret
                        };

                        // this enocding is for use in header authorization.
                        token.base64 = (new Buffer(JSON.stringify(token), 'utf8')).toString('base64');

                        return token;
                    });
            },
            verifyToken : function(token) {
                var user = this;

                return crypto_pbkdf2(token.secret, user.tokenSalt, 1000, 64, 'sha256')
                    .then(function(tokenHash){
                        if (tokenHash.toString('hex') === user.tokenHash) {
                            return user;
                        }

                        return null;
                    });
            },
            accessGranted : function(model, actions, resource) {
                var user = this;
                var resource_id = '' + resource._id;

                if (!user.accessRecords){
                    user.accessRecords = {};
                }

                if (!user.accessRecords[model]){
                    user.accessRecords[model] = {
                        id : [],
                        actions : []
                    };
                }

                var recordIndex = _.sortedIndex(user.accessRecords[model].id, resource_id);


                if (user.accessRecords[model].id[recordIndex] !== resource_id) {
                    user.accessRecords[model].id.splice(recordIndex, 0, resource_id);
                    user.accessRecords[model].actions.splice(recordIndex, 0, []);
                }

                user.accessRecords[model].actions[recordIndex] = _.union(user.accessRecords[model].actions[recordIndex], actions);

                user.markModified('accessRecords');

                return user.save();
            },
            accessRevoked = function(model, actions, resource) {
                var user = this;
                var resource_id = '' + resource._id;

                if (user.accessRecords[model]){
                    var recordIndex = _.sortedIndex(user.accessRecords[model].id, resource_id);

                    if (recordIndex !== -1) {

                        user.accessRecords[model].actions[recordIndex] = _.without(user.accessRecords[model].actions[recordIndex], actions);

                        if (user.accessRecords[model].actions[recordIndex].length === 0) {
                            // if no actions can be be performed, remove resource
                            user.accessRecords[model].id.splice(recordIndex, 1);
                            user.accessRecords[model].actions.splice(recordIndex, 1);

                            if (user.accessRecords[model].id.length === 0) {
                                // if there are no more resources of this type, then remove Model
                                delete user.accessRecords[model];
                            }
                        }
                    }
                }

                user.markModified('accessRecords');

                return user.save();
            },
            addGroup = function(group) {
                var user = this;
                var group_id = group._id.toString();

                var index = _.sortedIndex(user.groups, group_id);

                user.groups.slice(index, 0, group_id);

                return user.save();
            },
            removeGroup = function(group) {
                var user = this;
                var group_id = group._id.toString();

                var index = _.indexOf(user.groups, group_id, true);

                user.groups.slice(index, 1);

                return user.save();
            }
        }
    }
};
