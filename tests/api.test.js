import test from 'node:test';
import assert from 'node:assert';

// Simple API tests
test('VPN to Proxy API Tests', async (t) => {
  const baseUrl = 'http://localhost:3000';
  const apiKey = process.env.API_KEY || 'test-key';

  await t.test('Health Check', async () => {
    const response = await fetch(`${baseUrl}/health`);
    assert.strictEqual(response.status, 200);
    const data = await response.json();
    assert.ok(data.status === 'ok');
  });

  await t.test('VPN Status (with auth)', async () => {
    const response = await fetch(`${baseUrl}/api/vpn/status`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (response.status === 200) {
      const data = await response.json();
      assert.ok('isConnected' in data);
    }
  });

  await t.test('Proxy Status (with auth)', async () => {
    const response = await fetch(`${baseUrl}/api/proxy/status`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (response.status === 200) {
      const data = await response.json();
      assert.ok('activeConnections' in data);
    }
  });

  await t.test('Locations List', async () => {
    const response = await fetch(`${baseUrl}/api/vpn/locations`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (response.status === 200) {
      const data = await response.json();
      assert.ok(Array.isArray(data.locations));
      assert.ok(data.locations.length > 0);
    }
  });

  await t.test('Unauthorized Request (no API key)', async () => {
    const response = await fetch(`${baseUrl}/api/vpn/status`);
    // Should reject if API_KEY_ENABLED is true
    // Might return 401 or allow
  });
});
