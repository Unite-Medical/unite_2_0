import test from 'node:test';
import assert from 'node:assert/strict';
import {APPEARANCE_DEFAULTS,appearanceKey,normalizeAppearance,loadAppearance,saveAppearance,appearanceFontSize} from '../src/lib/workspaceAppearance.js';
test('base text index is additive, bounded and resettable',()=>{
 assert.equal(appearanceFontSize({fontIndex:0}),13);assert.equal(appearanceFontSize({fontIndex:1}),14);assert.equal(appearanceFontSize({fontIndex:-1}),12);assert.equal(appearanceFontSize({fontIndex:5}),18);
 assert.equal(appearanceFontSize({fontIndex:999}),18);assert.equal(appearanceFontSize({fontIndex:-99}),12);assert.equal(appearanceFontSize({fontIndex:1.5}),13);assert.deepEqual(normalizeAppearance(APPEARANCE_DEFAULTS),{theme:'light',fontIndex:0});
});
test('appearance persists per account without sharing settings or touching session records',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
 saveAppearance(storage,'damon',{theme:'dark',fontIndex:2});assert.deepEqual(loadAppearance(storage,'damon'),{theme:'dark',fontIndex:2});assert.deepEqual(loadAppearance(storage,'ashley'),APPEARANCE_DEFAULTS);
 saveAppearance(storage,'ashley',{theme:'light',fontIndex:5});assert.equal(loadAppearance(storage,'damon').fontIndex,2);assert.equal(values.size,2);assert.notEqual(appearanceKey('a/b'),appearanceKey('a%2Fb'));
 saveAppearance(storage,'damon',APPEARANCE_DEFAULTS);assert.deepEqual(loadAppearance(storage,'damon'),APPEARANCE_DEFAULTS);
});
test('malformed or unavailable browser storage does not break controls',()=>{
 assert.deepEqual(loadAppearance({getItem:()=>'{broken'},'x'),APPEARANCE_DEFAULTS);
 assert.deepEqual(loadAppearance({getItem:()=>{throw Error('blocked');}},'x'),APPEARANCE_DEFAULTS);
 const result=saveAppearance({setItem:()=>{throw Error('full');}},'x',{theme:'dark',fontIndex:1});assert.equal(result.persisted,false);assert.deepEqual(result.preferences,{theme:'dark',fontIndex:1});
});
