import { Template } from 'meteor/templating';

import { Documents } from '../api/documents.js';
import { Queries } from '../api/queries.js';

import  './body.html';

Meteor.startup(function () {
    delete Session.get('documents');
    delete Session.get('query');
});

Template.body.helpers({
    documents(){
        var query = Queries.find({}).fetch()[0];
        var scores = {};
        if(query){
            query.results = query.results.sort(function (a, b) {
                return b.score - a.score;
            }).slice(0,40);
            console.log(query);
            Session.set('documents', query.results.map(function (result) {
                return result.document_id;
            }));
            query.results.forEach(function (result) {
                scores[result.document_id] = result.score;
            });
        }else{
            Session.set('documents', []);
        }
        var documents = Documents.find({}).fetch();
        documents.map(function (document) {
            document.score = scores[document._id];
            return document;
        });
        return documents.sort(function (a, b) {
            return b.score - a.score;
        });
    }
});

Template.article.helpers({
    cardImage: function () {
        return this.images[0];
    },
    hasImages: function () {
      return this.images.length > 0 ? true : false;
    }
});

Template.body.events({
    'keyup #search': _.debounce(function(e) {
        Session.set('documents', []);
        Session.set('query', e.target.value);
    }, 300),
    'submit .query'(event){
        event.preventDefault();
    }
});

Meteor.autorun(function () {
    Meteor.subscribe('documents', Session.get('documents'));
    Meteor.subscribe('query', Session.get('query'));
    document.title = "News Search Engine, by Omar Contreras"
});