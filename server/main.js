import { Meteor } from 'meteor/meteor';
import { Documents } from '../imports/api/documents.js';
import { Dictionary } from '../imports/api/dictionary.js';
import { Postings } from '../imports/api/postings.js';
import { Queries } from '../imports/api/queries.js';
import natural from 'natural';
import MongoInternals from 'mongodb';
import math from 'mathjs';

Meteor.startup(() => {
    natural.PorterStemmer.attach();
});

Meteor.publish('query', function queryPublication(data) {
    if(!data){
        return [];
    }
    var tokens = data.tokenizeAndStem().sort();
    var terms = Dictionary.find({term: {$in: tokens}}, {fields: {_id:1, term:1, freq:1, docs: 1}}).fetch();
    var totalDocsTerms = 0;
    terms.forEach(function(term){
        totalDocsTerms += term.docs;
    });
    if(Queries.find({query:tokens.join("-"), docs:totalDocsTerms}).count()==0){
        if(terms.length==0){
            return [];
        }
        var termsDict = {};
        var pipelineAVDL = [
            {$group: {_id: "_id", sum: {$sum: "$length"}, total:{$sum:1}}}
        ];
        var totalDocs = Documents.aggregate(pipelineAVDL)[0];
        var N = totalDocs.total;
        var avdl = calculateAVLD(totalDocs, N);

        terms.forEach(function (term) {
            var qtf = 0;
            tokens.forEach(function (token) {
                qtf += token==term.term ? 1 : 0;
            });
            var idf = math.log10((N-term.docs+0.5)/(term.docs+0.5));
            termsDict[term._id._str] = {idf:idf, qtf: qtf};
        });
        var pipelineDocs = [
            {$match:{"term_id": {$in: terms.map(function (term) {
                return MongoInternals.ObjectID(term._id._str);
            })}}},
            {$group:{_id:"$document_id", terms:{$push:{term_id:"$term_id", freq:"$freq"}}}}
        ];
        var documentsTerm = Postings.aggregate(pipelineDocs);

        var documents = Documents.find({_id:{$in:documentsTerm.map(function (documentTerm) {
            return documentTerm._id;
        })}}, {_id:1, length: 1}).fetch();

        var documentsDict = {};

        documents.forEach(function (document) {
            documentsDict[document._id._str] = {length: document.length, score: 0.0};
        });

        documentsTerm.forEach(function (document) {
            if(documentsDict.hasOwnProperty(document._id)){
                documentsDict[document._id].terms = document.terms;
            }
        });
        var scores = [];
        for(var document_id in documentsDict){
            if(documentsDict.hasOwnProperty(document_id)){
                computeBM25(documentsDict[document_id], termsDict, N, avdl);
                scores.push({document_id: MongoInternals.ObjectID(document_id), score: documentsDict[document_id].score});
            }
        }
        Queries.upsert({query:tokens.join("-")},{$set:{docs:totalDocsTerms, results:scores}});


        return Queries.find({query:tokens.join("-")});
    }else{
        return Queries.find({query:tokens.join("-")});
    }
});

Meteor.publish('documents', function documentsPublication(documents) {
    return Documents.find({_id:{$in:documents}});
});

var calculateAVLD = function (result, N) {
    return result.sum / N;
}

var computeBM25 = function (documentDict, termsDict, N, avdl) {
    documentDict.terms.forEach(function (term) {
        var k1 = 1.5, b = 0.75, k3 = 500; //Constants
        var K = k1 * ((1-b)+(b*(documentDict.length/avdl)));
        documentDict.score += termsDict[term.term_id].idf * (((k1 + 1) * term.freq) / (K+term.freq)) * (((k3 + 1) * termsDict[term.term_id].qtf)/(k3 + termsDict[term.term_id].qtf));
    });
}