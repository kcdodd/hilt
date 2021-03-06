"use strict";

var apimodelfactory = require('./apifactory');
var fs = require('fs');
var path = require('path');
var formidable = require('formidable');
var error = require('../error');
var Promise = require('bluebird');
var server = require('../server');
var mongoose = require('mongoose');

var FileError = error('routes.api.file');

module.exports = {
    file : {
        state : {
            independent : {

            },
            dependent : {
                name : {type : String, default : ''},
                type : {type : String, default : ''},
                size : {type : Number, default : 0},
                hash : {type : String, default : '', index : true}
            },
            index : {owner: 1, name: 1}, //
        },
        create : {
            creatorAccess: ['root'],
            // also create the physical file on the server and compute hash
            handler : function(req){
                var file = this;

                var form = new formidable.IncomingForm();

                form.hash = 'sha1';

                return (new Promise(function (resolve, reject) {
                    try {
                        // TODO: check to see if user has already uploaded this file using file hash
                        // TODO: use promisify somehow to convert to promise directly?
                        form.parse(req, function(err, fields, files) {

                            if (err) {return reject(err);}

                            if (!files.file || !files.file.path) {
                                return reject(new FileError('nofile',
                                    'No file to upload.',
                                    [],
                                    400));
                            }

                            // move the file to the output folder
                            fs.renameSync(files.file.path, path.join(server.config.uploadPath, '' + file._id) );

                            file.name = files.file.name;
                            file.type = files.file.type;
                            file.size = files.file.size;
                            file.hash = files.file.hash;
                            resolve(file);
                        });

                    }catch(err) {
                        reject(err);
                    }
                }))
                .then(function(file){
                    return file.save();
                });
            }
        },
        get : {
            // anyone can access files uploaded through this model
            secure : false
        },
        update : {
            // files cannot be changed
            secure : true,
            handler: function(req) {
                throw new FileError('methodnotallowed',
                    'A file cannot be changed once uploaded. Upload to a new file.',
                    [],
                    405);
            },
        },
        // no restrictions to access, only uses http gets to base url
        static : {
        },
        // need execute permission, only uses http gets to specific resource
        safe : {
            secure : false,
            // anyone can get the physical file
            // GET /api/file/:id/filename/:filename (e.g. /api/file/12345/filename/hello.jpg)
            filename : {
                parameter : ':filename', // TODO: actually do anything with this? Just for the sake of route matching atm
                handler :  function(req, res) {
                    var file = this;

                    var options = {
                        root: server.config.uploadPath,
                        dotfiles: 'deny',
                        headers: {
                            'x-timestamp': Date.now(),
                            'x-sent': true
                        }
                    };


                    return (new Promise(function (resolve, reject) {
                        res.setHeader("Content-Type", file.type);
                        // thye filename on the server is the same as the _id, without extensions
                        res.sendFile(file._id, options, function(err){
                            if (err){
                                reject(err);
                            }else{
                                resolve();
                            }
                        });
                    }));
                }
            }
        },
        // need both execute and write permission, uses http posts to specific resource
        unsafe : {},
        // only accessible on the server
        internal : {

        }
    }
};
