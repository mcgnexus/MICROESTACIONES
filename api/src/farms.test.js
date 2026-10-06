import test from 'node:test';
import assert from 'node:assert/strict';
import { farmSchema } from './farms.js';

test('a farm requires latitude and longitude together', () => {
  assert.equal(farmSchema.safeParse({ name: 'El Llano' }).success, true);
  assert.equal(farmSchema.safeParse({ name: 'El Llano', latitude: 37.8, longitude: -2.5 }).success, true);
  assert.equal(farmSchema.safeParse({ name: 'El Llano', latitude: 37.8 }).success, false);
  assert.equal(farmSchema.safeParse({ name: 'El Llano', longitude: -2.5 }).success, false);
});

test('a farm rejects out-of-range coordinates and unknown fields', () => {
  assert.equal(farmSchema.safeParse({ name: 'El Llano', latitude: 91, longitude: 0 }).success, false);
  assert.equal(farmSchema.safeParse({ name: 'El Llano', latitude: 0, longitude: 181 }).success, false);
  assert.equal(farmSchema.safeParse({ name: 'El Llano', subscriber_id: 1 }).success, false);
});

test('a farm keeps its descriptive fields', () => {
  const parsed = farmSchema.parse({
    name: 'El Llano', municipality: 'Huéscar', crop: 'Cereal', livestock: 'Ovino',
  });
  assert.equal(parsed.crop, 'Cereal');
  assert.equal(parsed.livestock, 'Ovino');
});
