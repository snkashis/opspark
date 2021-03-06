'use strict';

var
    configPortfolio = require('../config.json').portfolio,
    configWebsite = require('../config.json').website,
    fs = require('fs'),
    url = require('url'),
    exec = require('child_process').exec,
    cheerio = require('cheerio'),
    colors = require('colors'),
    jQueryCdnScript = "    <script src=\"https://ajax.googleapis.com/ajax/libs/jquery/2.1.3/jquery.min.js\"></script>\n",
    portfolioScript = "        <script id=\"portfolioScript\">$(document).ready(function() {$.getJSON('projects/projects.json').then(function(data) { data.projects.forEach(function(project){ $('#portfolio').append('<li><a href=\"projects/' + project.name + '/\">' + project.title + ' : ' + project.description + '</a></li>'); }); }); });</script>\n    </body>";

module.exports.jQueryCdnScript = jQueryCdnScript;
module.exports.portfolioScript = portfolioScript;


function portfolio(filepath) {
    filepath = (filepath ? filepath : configPortfolio.filepath);
    if (!fs.existsSync(filepath)) return console.log(configPortfolio.help.incomplete.red);
    var html = fs.readFileSync(filepath, 'utf8');
    var $ = cheerio.load(html);
    var portfolioListTag = $('#portfolio')[0];
    if (!portfolioListTag) return console.log(configPortfolio.help.noPortfolioList.red);
    var portfolioScriptTag = $('#portfolioScript')[0];
    if (portfolioScriptTag) return console.log(configPortfolio.help.portfolioScriptTagExists.red);
    var result = html.replace(/<\/body>/g, jQueryCdnScript + portfolioScript);
    try {
        fs.writeFileSync(filepath, result, 'utf8');
        console.log('portfolio.html has been initialized!');
    } catch (err) {
        console.log('An error occurred while trying to write the portfolioScript to the portfolio.html file: ', err);
    }
}
module.exports.portfolio = portfolio;

// TODO : Consider changing invocation routes from index.js to a switch, by this, we can intercept the commander program object instead of having to test for typeof function for async callbacks //
/*
 * Will download all files required to kickstart the Operation Spark 
 * website project, and initialize the portfolio.html file so teachers 
 * or developers can get up to speed quickly.
 */
module.exports.website = function(next){
    console.log('Initializing website project, please wait...'.green);
    installWebsiteFiles(function(err) {
        if (err) return console.log(err);
        portfolio();
        typeof next === 'function' && next(null);
    });
};

function installWebsiteFiles(next) {
    var rootDirectory = './';
    var numFiles = configWebsite.url.length;
    var downloaded = 0;
    configWebsite.url.forEach(function(fileUrl){
        var filename = url.parse(fileUrl).pathname.split('/').pop();
        var message = 'Downloading ' + filename + ', please wait...';
        console.log(message.green);
        console.log(fileUrl);
        var wget = 'wget -nc -P ' + rootDirectory + ' ' + fileUrl;
        var child = exec(wget, function(err, stdout, stderr) {
            if (err) return next(err);
            message = filename + ' downloaded to ' + rootDirectory;
            console.log(message.green);
            if (++downloaded === numFiles) {
                console.log('All website files downloaded.'.green);
                next(null);
            }
        });
    });
}
