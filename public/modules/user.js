"use strict";

define(['angular'], function (angular){

    // module for grouping common interactions with the user model
    var module = angular.module('user', [])
        .config(['$urlRouterProvider', '$stateProvider', function($urlRouterProvider, $stateProvider){
            $stateProvider
                .state('user', {
                    url : '/user',
                    templateUrl : 'user'
                })
                .state('user.register', {
                    url : '/register',
                    templateUrl : 'user.register',
                    controller : 'user.register'
                })
                .state('user.login', {
                    url : '/login',
                    templateUrl : 'user.login',
                    controller : 'user.login'
                });
        }]);

    // create a new user
    module.controller('user.register', ['$scope', '$window', '$state', 'apifactory.models', function($scope, $window, $state, models){
        models('user')
        .then(function(api){
            $scope.user = {
                username : {
                    value : "",
                    success : false,
                    registered : false,
                    classes : {
                        group : {
                            "has-success" : false,
                            "has-feedback" : true
                        }
                    }
                },
                emailConfirmation : {
                    value : "",
                    success : false,
                    classes : {
                        group : {
                            "has-success" : false,
                            "has-feedback" : false
                        },
                    }
                },
                password : {
                    value : "",
                    success : false,
                    classes : {
                        group : {
                            "has-success" : false,
                            "has-feedback" : false
                        },
                    },
                    testResult : {
                        strength : 0,
                        crackTime : 'less than a second'
                    }
                },
                passwordConfirm : {
                    value : "",
                    success : false,
                    classes : {
                        group : {
                            "has-success" : false,
                            "has-feedback" : false
                        },
                    }
                },
                agreeToTaC : false,
                enablePasswordReset : false
            };

            //var email_regex = /[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?/;
            //
            var email_regex = /[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:[A-Z]{2}|com|org|net|gov|mil|biz|info|mobi|name|aero|jobs|museum)\b/;

            $scope.validate = {
                username : function() {
                    if ($scope.user.username.value === ''){
                        $scope.user.username.registered = true;
                        return;
                    }

                    api.user.registered($scope.user.username.value)
                    .then(function(registered){
                        $scope.user.username.registered = registered;
                    })
                    .catch(function(error){
                        $scope.error = error;
                    });
                },
                emailConfirmation : function() {

                    var valid = true;

                    $scope.user.emailConfirmation.success = valid;
                    $scope.user.emailConfirmation.classes.group["has-success"] = valid;
                    $scope.user.emailConfirmation.classes.group["has-feedback"] = valid;
                },
                password : function() {
                    //var result = owasp.test($scope.user.password.value);

                    api.user.passwordStrength($scope.user.password.value)
                    .then(function(result){
                        $scope.user.password.testResult = result;
                        var valid = result.strength >= 3;

                        $scope.user.password.success = valid;
                        $scope.user.password.classes.group["has-success"] = valid;
                        $scope.user.password.classes.group["has-feedback"] = valid;

                    })
                    .catch(function(error){
                        $scope.error = error;
                    });


                },
                passwordConfirm : function() {

                    var valid = $scope.user.password.value !== '' && $scope.user.password.value === $scope.user.passwordConfirm.value;

                    $scope.user.passwordConfirm.success = valid;
                    $scope.user.passwordConfirm.classes.group["has-success"] = valid;
                    $scope.user.passwordConfirm.classes.group["has-feedback"] = valid;
                },
            };

            $scope.validate.username();

            $scope.allowRegister = function() {
                if (!$scope.user.username.registered && (!$scope.requireEmailConfirmation || user.emailConfirmation.success)) {
                    if ($scope.user.password.success && $scope.user.passwordConfirm.success) {
                        if (!$scope.admin.requireAgreement || $scope.user.agreeToTaC) {
                            return true;
                        }
                    }
                }

                return false;
            };

            $scope.submit = function () {
                if (!$scope.user.username.registered){

                    api.user.register({
                        username : $scope.user.username.value,
                        emailConfirmation : $scope.user.emailConfirmation.value,
                        password : $scope.user.password.value,
                        agreeToTaC : $scope.user.agreeToTaC,
                        enablePasswordReset : $scope.user.enablePasswordReset
                    })
                    .then(function(user){
                        return api.user.login({
                            username : $scope.user.username.value,
                            password : $scope.user.password.value
                        });
                    })
                    .then(function(){
                        $state.go('home');
                    })
                    .catch(function(error){
                        $scope.error = error;
                    });
                }else{
                    api.user.login({
                        username : $scope.user.username.value,
                        password : $scope.user.password.value
                    })
                    .then(function(res){
                        $state.go('home');
                    })
                    .catch(function(error){
                        $scope.error = error;
                    });
                }
            };

            $scope.oAuthWindow = function() {
                api.user.google.auth.url()
                .then(function(url){
                    $window.googleCallback = function(err, code) {
                        // TODO: find a different way to hook back to the parent
                        // window
                        delete $window.googleCallback;
                        $window.focus();

                        if (err !== '') {
                            $scope.$apply(function(){
                                $scope.error = {
                                    message : err
                                };
                            });

                            return;
                        }

                        api.user.google.login(code)
                        .then(function(){
                            $state.go('home');
                        })
                        .catch(function(error){
                            $scope.error = error;
                        });
                    };

                    var childWindow = $window.open(url);
                    childWindow.focus();

                    // This doesn't work because I think I don't have control over
                    // the window once I hand it off to google so the callback disapears.
                    //childWindow.onbeforeunload = function(event) {
                    //};

                })
                .catch(function(error){
                    $scope.error = error;
                });
            };
        });

    }]);


    // user password reset
    module.controller('user.reset', ['$scope', 'apifactory.models', function($scope, models){
        models('user')
        .then(function(api){

        });
    }]);

    //
    // These are controllers for stand-alone components dealing with a user.
    //

    // light-weight user controls
    module.controller('user.welcome', ['$scope', '$state', 'apifactory.models', function($scope, $state, models){
        models('user')
        .then(function(api){
            $scope.api = api;
            //TODO: add login modal
            $scope.logout = function() {
                api.user.logout();
            };
        });
    }]);

});
