import { Meteor } from 'meteor/meteor';
import { Documents } from '../imports/api/documents.js';
import { Dictionary } from '../imports/api/dictionary.js';
import { Postings } from '../imports/api/postings.js';
import natural from 'natural';

Meteor.startup(() => {
    natural.PorterStemmer.attach();
});

Meteor.publish('documents', function documentPublication(data) {
    if(!data){
        return [];
    }
    var tokens = data.tokenizeAndStem();
    var terms = Dictionary.find({term: {$in: tokens}}, {fields: {_id:1, freq:1}}).fetch();
    if(terms.length==0){
        return [];
    }
    var N = Documents.find().count();
    var pipelineAVDL = [
        {$group: {_id: "$document_id", document_length: {$sum: "$freq"}}}
    ];
    var avdl = calculateAVLD(Postings.aggregate(pipelineAVDL));
    var pipelineTermsFreq = [
        // {$match: {term_id: {
        //     $in: terms.map(function (term) {
        //         return term._id;
        //     })
        // }}},
        {$match: {term_id: {$in: terms.map(function (term) {
            console.log(term._id);
            return term._id;
        })}}},
        // {$group: {_id: "$term_id", term_document:{$sum: 1}}}
    ];
    //TODO Fix this aggregation :(
    console.log(Postings.aggregate(pipelineTermsFreq));
    var postings = Postings.find({term_id: {$in: terms.map(function (term) {
        return term._id;
    })}}).fetch();
    return Documents.find({_id: {$in: postings.map(function (posting) {
        return posting.document_id;
    })}});
});

var calculateAVLD = function (documents) {
    var avdl = 0;
    documents.forEach(function (document) {
        avdl += document.document_length;
    });
    return avdl / documents.length;
}

var computeBM24 = function (documentVector, queryVector, N, avdl, callback) {
    var rank = 0;
    callback(rank);
}

var calculateBM25 = function(documentVector, queryVector, N, avdl, callback){
    var rank = 0;
    var dl = getDocumentLength(documentVector); // Document Length
    documentVector.terms.forEach(function(term){
        var qtf = queryVector[term.term] >= 1 ? queryVector[term.term] : 0;
        if(qtf>0){
            var n = term.docs; //Number of documents that contain the term
            var w = Math.log((n+0.5)/(N-n+0.5)) / Math.LN10;
            var k1 = 1.5, b = 0.75, k3 = 500; // Constants
            var K = k1*((1-b)+(b*(dl/avdl)));
            var tf = term.docFreq; // Term's frequency in document
            rank += w * (((k1 + 1) * tf)/(K+tf)) * (((k3 + 1) * qtf)/(k3 + qtf));
        }
    });
    callback(rank);
}