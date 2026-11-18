'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {matches}=require('../destination-match');
test('wrong business cannot satisfy distinctive Q brand even at correct locality',()=>{
 assert.equal(matches('q bistro taman melati',{name:'Restoran Zaynas Bistro',address:'Jalan Melati Utama 2, Taman Melati, Kuala Lumpur'}),false);
 assert.equal(matches('q bistro taman melati',{name:"Q’Bistro",address:'Taman Melati, Kuala Lumpur'}),true);
});
test('partial typing, accents, address queries, and short brand tokens',()=>{
 assert.equal(matches('taman mela',{name:'Q Bistro',address:'Taman Melati'}),true);
 assert.equal(matches('cafe',{name:'Café Sentral',address:'KL'}),true);
 assert.equal(matches('Jalan Melati Utama 4',{name:'Q Bistro',address:'75, Jalan Melati Utama 4'}),true);
 assert.equal(matches('q',{name:'Queen Bistro',address:'Melati'}),false);
});
