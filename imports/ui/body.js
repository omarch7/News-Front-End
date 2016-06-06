import { Template } from 'meteor/templating';

import { Documents } from '../api/documents.js';

import  './body.html';


Template.body.helpers({
    documents(){
        return Documents.find({},{sort:{date:1}});
    }
});

Template.body.events({
    'keyup #search': _.debounce(function(e) {
        Session.set('query', e.target.value);
    }, 300)
});

Meteor.autorun(function () {
   Meteor.subscribe('documents', Session.get('query'));
});