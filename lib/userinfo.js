'use strict';

var express = require('express');
var async = require("async");
var bodyParser = require('body-parser');
var cors = require('cors');
var request = require('request');
var tenantsList = require('/data/serverdata.json');
var bluebird = require('bluebird');
var fs = require('fs');
var JSONALL = {};




// READ IN THE MASTERFILE (DB) TO GET THE TENANTS,
// TOKENS, AND SERVICE LIST
var getMasterJSON = function() {
    let rawdata = fs.readFileSync('/data/serverdata.json');
    let parsedata = JSON.parse(rawdata);
    JSONALL = parsedata;
};

/**
 * setting up the base route
 * 
 * @returns
 */
function  userinfoRoute() {
    var userinfo = new express.Router();
    userinfo.use(cors());
    userinfo.use(bodyParser());
    // TEST BASE URL - GET ENDPOINT - query params may or may not be populated
    userinfo.get('/', function(req, res) {
        var world = req.query && req.query.hello ? req.query.hello : 'World';
        res.json({
            msg: 'API  ' + world
        });
    });




    /**
     * API end point to be called by drupal app and the like
     * 
     * @param req
     * @param res
     * @returns
     */
    userinfo.get('/userinfo.json', function(req, res) {
        res.header("Content-Type", "application/json; charset=utf-8");
        getMasterJSON();
        var email = req.query.email;
        var subscriptions = {};
        subscriptions.userEmail = email;
        var validTenants = JSONALL.master.tenants.filter(function(el) {
            return el.visible;
        });
        var tenantLenth = validTenants.length;
        var mastertenants = [];
        // iterate through all the tenants for the given user email
        async.each(validTenants, function(tenant, callback) {
            console.log('handling tenant' + tenant.name);
            // create a tenant object
            var tenantToAdd = {};
            tenantToAdd.name = tenant.name;
            // Chain the two promises..if the user does not exist based on the
            // resolution of the first promise..just move along
            var idPromise = getClientIdForTenant(tenant, email);
            idPromise.then(function(payLoad) {
                if (JSON.parse(payLoad).status) {
                    callback(null);
                } else {
                    var userid = JSON.parse(payLoad).account.id;
                    var appPromise = getTenantSubscriptionKeysForUser(userid, tenant);
                    appPromise.then(function(keyInfo) {
                	
                	var apps = JSON.parse(keyInfo);
                	console.log(apps);
                /*	var arrayLength = apps.applications.applications.length;
                	for (var i = 0; i < arrayLength; i++) {
                	    var newLink = {};
                    	    newLink.rel = "self_new";
                    	    // https://cra-arc.beta.api.canada.ca/admin/applications/60?lang=en
                    	    newLink.href = "https://" + tenant.name + ".beta.api.canada.ca/admin/applications/" + apps.applications.applications[i].id + "?lang=en";
                    	    apps.applications.applications[i].links.push(newLink);
                	 }*/
                	tenantToAdd.applications = apps;
                        console.log("pushing to master ten" + tenantToAdd.name);
                        pushToMasterTenant(mastertenants, tenantToAdd);
                        callback(null);
                    })
                }
            });
        }, function(err) {
            console.log('Final resolve/ Final callback');
            // if any of the tenant additions lead to an error....not happening
	    // in our case but
            if (err) {
                // One of the iterations produced an error.
                // All processing will now stop.
                console.log('Failed to add a tenant..bailing out');
            } else {
                console.log('Adding master tenants ' + mastertenants.length);
                // add tenants to this subscription... return the json
                subscriptions.tenants = mastertenants;
                res.json(subscriptions);
            }
        });




    });




    /**
     * Get the users client id for the tenant
     */
    function getClientIdForTenant(tenant, email) {
        return new Promise(function(resolve, reject) {
            var url = 'https://' + tenant.admin_domain + '/admin/api/accounts/find.json?access_token=' + tenant.access_token + '&email=' + encodeURIComponent(email);
            request(url, function(err, response, body) {
                if (err)
                    return reject(err);
                try {
                    resolve(body);
                } catch (e) {
                    reject(e);
                }
            });
        });
    }

    /**
     * Get the subscription info for the user for a given tenant
     */
    function getTenantSubscriptionKeysForUser(id, tenant) {
        console.log("this is the user id " + id);
        return new Promise(function(resolve, reject) {
            var url = 'https://' + tenant.admin_domain + '/admin/api/accounts/' + id + '/applications.json?access_token=' + tenant.access_token;
            console.log("this is the url" + url);
            request(url, function(err, response, body) {
                if (err)
                    return reject(err);
                try {
                    resolve(body);
                } catch (e) {
                    reject(e);
                }
            });
        });
    }

    /**
     * making sure we push unique tenants...probably don't need it since there
     * are no bad global var...
     */
    function pushToMasterTenant(arr, obj) {
        const index = arr.findIndex((e) => e.name === obj.name);
        if (index === -1) {
            arr.push(obj);
        } else {
            arr[index] = obj;
        }
    }

    return userinfo;
}
module.exports = userinfoRoute;