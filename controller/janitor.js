var 
    fs = require("fs"),
    _ = require('lodash'),
    colors = require('colors'),
    projects = require('./projects');

module.exports.fix = function (complete) {
    var projectsDirectory = './projects';
    if (!fs.existsSync(projectsDirectory)) return complete(new Error('No projects installed, aborting fix, install some projects first by running "os install"'));
    
    projects.list(function(err, list) {
        fs.readdir(projectsDirectory, function (err, files) {
            if (err) return complete(err);
    
            // For every file in the list //
            files.forEach(function (file) {
                console.log('Checking project %s, please wait...'.green, file);
                var path = projectsDirectory + "/" + file;
                
                fs.stat(path, function (err, stat) {
                    if (err) return complete(err);
                    if (stat && stat.isDirectory()) {
                        if (!fs.existsSync(path + '/index.html')) {
                            return console.log('No index.html file found in %s, possibly not a valid Operation Spark project or somethings outta wack, check it out manually. Skipping...'.green, path);
                        }
                        var project = _.where(list, { 'name': file})[0];
                        if (project) {
                            projects.initializeProject(project, null, path, function() {
                                console.log('All done checking project %s!'.green, project.name);
                            });
                        }
                    } else {
                        console.log('%s is not a recognized project, skipping file...'.green, file);
                    }
                });
            });
        });
    });
};