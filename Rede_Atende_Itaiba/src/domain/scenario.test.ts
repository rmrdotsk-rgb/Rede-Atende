import test from 'node:test';
import assert from 'node:assert/strict';
import { StorageService, STATE_KEY } from './RequestEngine';
function fixture() {
  let raw: string | null = null;
  return {
    store: {
      length: 1,
      key: () => STATE_KEY,
      getItem: () => raw,
      setItem: (_key: string, value: string) => {
        raw = value;
      },
      removeItem() {},
      clear() {},
    } as Storage,
    raw: () => raw,
  };
}
test('cenários somam registros e preservam protocolos anteriores', () => {
  const f = fixture(),
    s = new StorageService(f.store);
  const before = s.getRequests();
  s.loadDemoScenario('transporte');
  assert.equal(s.getRequests().length, before.length + 1);
  for (const r of before) assert.equal(s.getRequestById(r.id)?.protocol, r.protocol);
});
test('falha na gravação final do cenário preserva a base anterior inteira', () => {
  const f = fixture(),
    s = new StorageService(f.store);
  s.init();
  const before = f.raw();
  f.store.setItem = () => {
    throw new Error('disco cheio');
  };
  assert.throws(() => s.loadDemoScenario('merenda'));
  assert.equal(f.raw(), before);
});
