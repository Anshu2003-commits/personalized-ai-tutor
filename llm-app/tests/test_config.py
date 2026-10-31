import os
import unittest

from app.agent.config import get_settings


class ConfigTests(unittest.TestCase):
    def tearDown(self):
        os.environ.pop("MEMORY_ENABLED", None)
        os.environ.pop("MEMORY_DB_PATH", None)
        os.environ.pop("MEMORY_MODEL", None)
        os.environ.pop("MEMORY_REFLECT_EVERY_TURNS", None)
        os.environ.pop("MEMORY_MAX_APPENDS_PER_REFLECTION", None)
        os.environ.pop("MEMORY_CONSOLIDATE_AT_BULLETS", None)
        os.environ.pop("MEMORY_MAX_BULLETS", None)
        os.environ.pop("MEMORY_MAX_CHARS", None)
        os.environ.pop("EDITOR_SNAPSHOT_MAX_CHARS", None)
        get_settings.cache_clear()

    def test_memory_settings_defaults(self):
        get_settings.cache_clear()

        settings = get_settings()

        self.assertTrue(settings.memory_enabled)
        self.assertEqual(settings.memory_db_path, ".data/tutor_memory.sqlite3")
        self.assertEqual(settings.memory_model, "gpt-5-mini")
        self.assertEqual(settings.memory_reflect_every_turns, 3)
        self.assertEqual(settings.memory_max_appends_per_reflection, 3)
        self.assertEqual(settings.memory_consolidate_at_bullets, 24)
        self.assertEqual(settings.memory_max_bullets, 30)
        self.assertEqual(settings.memory_max_chars, 2_000)
        self.assertEqual(settings.editor_snapshot_max_chars, 12_000)

    def test_memory_settings_can_be_disabled(self):
        os.environ["MEMORY_ENABLED"] = "false"
        os.environ["MEMORY_DB_PATH"] = ":memory:"
        os.environ["MEMORY_MODEL"] = "memory-test-model"
        os.environ["MEMORY_REFLECT_EVERY_TURNS"] = "1"
        os.environ["MEMORY_MAX_APPENDS_PER_REFLECTION"] = "2"
        os.environ["MEMORY_CONSOLIDATE_AT_BULLETS"] = "4"
        os.environ["MEMORY_MAX_BULLETS"] = "10"
        os.environ["MEMORY_MAX_CHARS"] = "500"
        os.environ["EDITOR_SNAPSHOT_MAX_CHARS"] = "1000"
        get_settings.cache_clear()

        settings = get_settings()

        self.assertFalse(settings.memory_enabled)
        self.assertEqual(settings.memory_db_path, ":memory:")
        self.assertEqual(settings.memory_model, "memory-test-model")
        self.assertEqual(settings.memory_reflect_every_turns, 1)
        self.assertEqual(settings.memory_max_appends_per_reflection, 2)
        self.assertEqual(settings.memory_consolidate_at_bullets, 4)
        self.assertEqual(settings.memory_max_bullets, 10)
        self.assertEqual(settings.memory_max_chars, 500)
        self.assertEqual(settings.editor_snapshot_max_chars, 1000)


if __name__ == "__main__":
    unittest.main()
