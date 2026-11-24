import importlib.util
import pathlib
import unittest

SCRIPT = pathlib.Path(__file__).parents[1] / 'scripts' / 'sync_captures.py'
spec = importlib.util.spec_from_file_location('sync_captures', SCRIPT)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

EXISTING = [
    {'id': 100, 'datetime': '22. 11. 2026, 12:00:00', 'station': 'Lehovec', 'category': 'tram', 'team': 'Cosa Nostra', 'value': 3, 'author': 'A'},
    {'id': 101, 'datetime': '22. 11. 2026, 12:10:00', 'station': 'Hloubětín', 'category': 'tram', 'team': 'Yakuza', 'value': 4, 'author': 'B'},
]
TOPOLOGY = {'stations': [{'name': 'Lehovec', 'category': 'tram'}, {'name': 'Hloubětín', 'category': 'tram'}]}
TEAMS = {'Cosa Nostra', 'Yakuza'}

class MergeTest(unittest.TestCase):
    def test_append_only(self):
        fresh = {**EXISTING[1], 'id': 102, 'value': 5}
        out, added = mod.merge(EXISTING, [EXISTING[0], EXISTING[1], fresh], TOPOLOGY, TEAMS)
        self.assertEqual(added, 1)
        self.assertEqual([x['id'] for x in out], [100, 101, 102])

    def test_idempotent(self):
        out, added = mod.merge(EXISTING, EXISTING, TOPOLOGY, TEAMS)
        self.assertEqual(added, 0)
        self.assertEqual(out, EXISTING)

    def test_conflicting_id_is_rejected(self):
        conflict = {**EXISTING[1], 'team': 'Cosa Nostra'}
        with self.assertRaises(mod.SyncError):
            mod.merge(EXISTING, [EXISTING[0], conflict], TOPOLOGY, TEAMS)

    def test_missing_overlap_is_rejected(self):
        with self.assertRaises(mod.SyncError):
            mod.merge(EXISTING, [EXISTING[0]], TOPOLOGY, TEAMS)

    def test_invalid_stop_is_rejected(self):
        bad = {**EXISTING[1], 'id': 102, 'station': 'Fake'}
        with self.assertRaises(mod.SyncError):
            mod.merge(EXISTING, [EXISTING[1], bad], TOPOLOGY, TEAMS)

    def test_url_guard(self):
        with self.assertRaises(mod.SyncError):
            mod.safe_url('https://example.com/captures', mod.GALLERY)

if __name__ == '__main__':
    unittest.main()
