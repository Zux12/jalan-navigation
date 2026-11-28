'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');

const window = {};
vm.runInNewContext(readFileSync(join(__dirname, '../passenger-weather-data.js'), 'utf8'), {window, Date});
const {hour, parse, slot, destinationCell} = window.JalanWeatherData;
const start = Math.floor(Date.now() / hour) * hour;

function row(at, code, temperature) {
  return {
    time: new Date(at).toISOString(),
    data: {instant:{details:{air_temperature:temperature}}, next_1_hours:{summary:{symbol_code:code}}}
  };
}

test('arrival selects the forecast hour across midnight in Malaysia and preserves the issue time', () => {
  const midnight = Date.UTC(2026, 10, 28, 16);
  const before = row(midnight-hour, 'cloudy', 28.6);
  const after = row(midnight, 'lightrain_night', 24.2);
  const body = {properties:{meta:{updated_at:new Date(start-hour).toISOString()},timeseries:[before,after]}};
  const forecast = parse(body,start+hour,start);
  assert.equal(forecast.issued,start-hour);
  assert.equal(forecast.expires,start+hour);
  assert.deepEqual(Array.from(slot(forecast,midnight-1)),['cloudy',29]);
  assert.deepEqual(Array.from(slot(forecast,midnight)),['lightrain_night',24]);
  assert.equal(slot(forecast,midnight+hour),null);
});

test('an old model run, an unknown condition or missing hourly data cannot appear as fresh weather', () => {
  const rows = [row(start, 'cloudy', 28), row(start+hour, 'unrecognised', 25)];
  const later = row(start+hour*2,'cloudy',27);
  later.data.next_6_hours = later.data.next_1_hours;
  delete later.data.next_1_hours;
  rows.push(later);
  const body = {properties:{meta:{updated_at:new Date(start).toISOString()},timeseries:rows}};
  const fresh = parse(body,NaN,start);
  assert.equal(fresh.expires,start);
  assert.equal(slot(fresh,start+hour),null);
  assert.equal(slot(fresh,start+hour*2),null);
  body.properties.meta.updated_at = new Date(start-25*hour).toISOString();
  assert.equal(slot(parse(body,start,start),start),null);
  assert.equal(parse({},start,start),null);
});

test('weather uses a coarse destination cell and ignores invalid or out-of-area destinations', () => {
  assert.deepEqual(Array.from(destinationCell([2.92857,101.69511])),[2.95,101.7]);
  for (const point of [null,[],[3],[3,101,42],[NaN,102],[5.98,116.07]]) {
    assert.equal(destinationCell(point),null);
  }
});
