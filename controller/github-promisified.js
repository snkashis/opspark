'use strict';

var 
    config = require('../config'),
    Q = require('q'),
    _ = require('lodash'),
    util = require('util'),
    fs = require('fs'),
    fsJson = require('fs-json')(),
    child = require('./child'),
    colors = require('colors'),
    view = require('../view'),
    mkdirp = require('mkdirp'),
    exec = require('child_process').exec,
    request = require('request'),
    github = require('octonode'),
    env = require('./env'),
    applicationDirectory = env.home() + '/opspark',
    authFilePath = applicationDirectory + '/github',
    userFilePath = applicationDirectory + '/user',
    _auth,
    _user,
    _client,
    _opspark;
    
// TODO : consider the "module level" vars, like _client in this implementation, are they necessary.


function user(username, complete) {
    var deferred = Q.defer();
    getOrCreateClient(function (err, client) {
        if (err) return deferred.reject(err);
        client.get('/users/' + username, {}, function (err, status, body, headers) {
            if (err) deferred.reject(err);
            else deferred.resolve(body);
        });
    });
    return deferred.promise.nodeify(complete);
}
module.exports.user = user;

module.exports.repo = function (username, repoName, complete) {
    getOrCreateClient(function (err, client) {
        if (err) return complete(err);
        var ghrepo = client.repo(username + '/' + username + '.github.io');
        ghrepo.info(function (er, statu, bod, header) {
            console.log(bod);
            complete(null, bod);
        });
    });
};

module.exports.limit = function (complete) {
    getOrCreateClient(function (err, client) {
        if (err) return complete(err);
        client.limit(function (err, left, max) {
            if (err) return complete(err);
            var message = 'GitHub limit: ' + left + ' used of ' + max + '.';
            complete(null, message);
        });
    });
};


/*
 * TODO : 
 * 1. Case for token exists at GitHub but has been deleted locally:
 *      a. curl to delete existing token, (user will need to provide creds).
 *      b. re-curl to install new token.
 *      OR
 *      a. add a timestamp to the hostname.
 */
function authorize(username, complete) {
    var note = getNoteForHost();
    var cmd = 'curl https://api.github.com/authorizations --user "' + username + '" --data \'{"scopes":["public_repo", "gist"],"note":"' + note + '","note_url":"https://www.npmjs.com/package/opspark"}\'';
    var child = exec(cmd);
    child.stdout.on('data', function(data) {
        console.log('stdout: ', data);
        if (data.indexOf('token') > -1) {
            try {
                _auth = JSON.parse(data);
            } catch (err) {
                return complete(err);
            }
            console.log('GitHub login succeeded!'.green);
            writeToken(_auth);
            obtainAndWriteUser(username);
        }
    });
    child.stderr.on('data', function(data) {
        console.log(data);
    });
    child.on('close', function(code) {
        console.log('closing code: ' + code);
        complete(null, _auth);
    });
}
module.exports.authorize = authorize;

function writeToken(token) {
    ensureApplicationDirectory();
    fsJson.saveSync(authFilePath, token);
}
module.exports.writeToken = writeToken;

function repos(complete) {
    // the client also initializes opspark, which isn't very clear - perhaps you should refactor to create opspark here, or? //
    getOrCreateClient(function (err, client) {
        if (err) return complete(err);
        _opspark.repos(1, 100, function (err, repos) {
            if (err) return complete(err);
            complete(null, repos);
        });
    });
}
module.exports.repos = repos;

function getOrObtainAuth(complete) {
    if (_auth) return complete(null, _auth);
    if (fs.existsSync(authFilePath)) {
        _auth = fsJson.loadSync(authFilePath);
        hasAuthorization(_auth.token, function(err, response, body) {
            if (!err && response.statusCode == 200) {
                return complete(null, _auth);
            } else {
                console.log('Hmm, something\'s not right!'.green);
                console.log('Let\'s try to login to GitHub again:'.green);
                fs.unlinkSync(authFilePath);
                obtainAuthorization(complete);
            }
        });
    } else {
        obtainAuthorization(complete);
    }
}
module.exports.getOrObtainAuth = getOrObtainAuth;

function obtainAuthorization(complete) {
    view.inquireForInput('Enter your GitHub username', function (err, input) {
        if (err) return complete(err);
        authorize(input, function(){
            complete(null, _auth);
        });
    });
}

function hasAuthorization(token, complete) {
    var options = {
        url: util.format('https://api.github.com/?access_token=%s', token),
        headers: {
            'User-Agent': config.userAgent
        }
    };
    request(options, complete);
}

function getOrCreateClient(complete) {
    if (_client) return complete(null, _client);
    
    getOrObtainAuth(function(err, auth) {
        if (err) return complete(err);
        _client = github.client(auth.token);
        _opspark = _client.org('OperationSpark');
        complete(null, _client);
    });
}

function listAuths(username, complete) {
    var cmd = 'curl -A "' + config.userAgent + '" --user "' + username + '" https://api.github.com/authorizations';
    var child = exec(cmd, function(err, stdout, stderr) {
        if (err) return complete(err);
        console.log('stdout: ', stdout.green);
        console.log('stdout: ', stderr.green);
        complete(err, stdout, stderr);
    });
}
module.exports.listAuths = listAuths;

function getNoteForHost() {
    return util.format(config.github.note, env.hostname());
}
module.exports.getNoteForHost = getNoteForHost;

function getOrObtainUser() {
    if(_user) return Q.when(_user);
    return ggetOrObtainAuth()
        .then(loadUser)
        .then(function(user) {
            return user || view.promptForInput('Enter your GitHub username')
                .then(obtainAndWriteUser);
        });
    // if (fs.existsSync(userFilePath)) {
    //     _user = fsJson.loadSync(userFilePath);
    //     return Q.when(_user);
    // }
    // return obtainUser();
}
module.exports.getOrObtainUser = getOrObtainUser;

function loadUser() {
    var user;
    if (fs.existsSync(userFilePath)) {
        user = fsJson.loadSync(userFilePath);
    }
    return user;
}

function obtainUser() {
    ggetOrObtainAuth()
        .then(loadUser)
        .then(function(user) {
            return user || view.promptForInput('Enter your GitHub username')
                .then(obtainAndWriteUser);
        });
    // do we have auth, if yes, ask for username, then get user //
    // if (_auth) {
    //     console.log('Before proceeding, we need your GitHub user information:');
    //     return view.promptForInput('Enter your GitHub username')
    //         .then(obtainAndWriteUser);
    // } else {
    //     return ggetOrObtainAuth().then(getOrObtainUser);
    // }
}

function promptForUserName() {
    var deferred = Q.defer();
    view.promptForInput('Enter your GitHub username', function (err, input) {
        if (err) return deferred.reject(err);
        deferred.resolve(input);
    });
    return deferred.promise;
}

function obtainAndWriteUser(username) {
    return uuser(username)
        .then(function(user) {
            writeUser(_user = user);
            return user;
        });
}

function writeUser(user) {
    ensureApplicationDirectory();
    fsJson.saveSync(userFilePath, user);
}

function ensureApplicationDirectory() {
    if (!fs.existsSync(applicationDirectory)) mkdirp.sync(applicationDirectory);
}

////////////////////////////////////////////////////////////////////////////////

function uuser(username, complete) {
    var deferred = Q.defer();
    ggetOrCreateClient().then(function(client){
        client.get('/users/' + username, {}, function (err, status, body, headers) {
            if (err) deferred.reject(err);
            else deferred.resolve(body);
        });
    });
    return deferred.promise;
}

function ggetOrCreateClient() {
    if(_client) return Q(_client);
    return ggetOrObtainAuth()
        .then(createClient);
}

function createClient(auth) {
    _client = github.client(auth.token);
    _opspark = _client.org('OperationSpark');
    return Q(_client);
}

function ggetOrObtainAuth() {
    if(_auth) return Q(_auth);
    if (fs.existsSync(authFilePath)) {
        _auth = fsJson.loadSync(authFilePath);
        return hhasAuthorization(_auth.token).catch(reauth);
    } else {
        return oobtainAuthorization();
    }
}

// function loadAuth() {
//     if (fs.existsSync(authFilePath)) return Q(fsJson.loadSync(authFilePath));
//     return Q.reject(new Error('No local auth found!'));
// }

function reauth() {
    console.log('Hmm, something\'s not right!'.green);
    console.log('Let\'s try to login to GitHub again:'.green);
    fs.unlinkSync(authFilePath);
    return oobtainAuthorization();
}

function oobtainAuthorization() {
    return view.promptForInput('Enter your GitHub username')
        .then(function (username) {
            return aauthorize(username)
                .then(writeToken)
                .then(function() {
                    obtainAndWriteUser(username);
                });
        });
}

function aauthorize(username) {
    var deferred, note, cmd, child, auth, err;
    
    deferred = Q.defer(),
    note = getNoteForHost(),
    cmd = 'curl https://api.github.com/authorizations --user "' + username + '" --data \'{"scopes":["public_repo", "gist"],"note":"' + note + '","note_url":"https://www.npmjs.com/package/opspark"}\'',
    child = exec(cmd);
    
    child.stdout.on('data', function(data) {
        console.log('stdout: ', data);
        if (data.indexOf('token') > -1) {
            try {
                auth = JSON.parse(data);
            } catch (error) {
                return deferred.reject(error);
            }
            console.log('GitHub login succeeded!'.green);
        }
    });
    child.stderr.on('data', function(data) {
        console.log(data);
        err = data;
    });
    child.on('close', function(code) {
        console.log('closing code: ' + code);
        if (err) return deferred.reject(err);
        deferred.resolve(auth);
    });
    
    return deferred.promise;
}

function hhasAuthorization(auth) {
    var deferred = Q.defer();
    var options = {
        url: util.format('https://api.github.com/?access_token=%s', auth.token),
        headers: {
            'User-Agent': config.userAgent
        }
    };
    request(options, function(err, response, body) {
        if (!err && response.statusCode == 200) {
            deferred.resolve(_auth);
        } else {
            deferred.reject(err);
        }
    });
    return deferred.promise;
}
