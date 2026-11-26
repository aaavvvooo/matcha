import pytest

from application.websocket.manager import PresenceManager


class FlakyRepo:
    def __init__(self):
        self.fail = True
        self.online = []

    async def set_online(self, user_id):
        if self.fail:
            raise ConnectionError("database away")
        self.online.append(user_id)

    async def set_offline(self, user_id):
        pass


async def test_a_failed_connect_leaves_no_ghost_online(monkeypatch):
    manager, repo = PresenceManager(None), FlakyRepo()
    monkeypatch.setattr(manager, "user_repo", repo)

    with pytest.raises(ConnectionError):
        await manager.connect(1, object())
    assert manager.sockets_of(1) == []

    repo.fail = False
    assert await manager.connect(1, object())
    assert repo.online == [1]  # treated as the first socket again
