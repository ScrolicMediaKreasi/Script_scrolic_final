import sys

sys.path.insert(0, '/app')

from fastapi.testclient import TestClient

import backend.server as server


def test_logout_clears_fallback_session_for_master_reversal():
    server.active_session_user_id = 'master_reversal'

    response = TestClient(server.app).post('/api/auth/logout')

    assert response.status_code == 200
    assert response.json() == {'success': True}
    assert server.active_session_user_id is None