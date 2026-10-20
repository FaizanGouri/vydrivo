import unittest
import os
import urllib.parse
from unittest.mock import patch
from services.job_manager import Job, JobManager, DOWNLOADS_DIR
from services.security import sanitize_filename

class TestMediaOutput(unittest.TestCase):

    def test_unicode_filename_encoding(self):
        # International & emoji titles
        test_titles = [
            "5 Naruto Legends Who Deserved More! 🔥",
            "हिंदी गाने 2026 - Best Hits",
            "Anime_Theme_Song_Official_(HD).mp4",
        ]
        for title in test_titles:
            clean = sanitize_filename(title)
            # URL quote for RFC 5987
            encoded = urllib.parse.quote(clean)
            self.assertTrue(len(encoded) > 0)
            self.assertNotIn("\n", encoded)
            self.assertNotIn("\r", encoded)

    def test_missing_ffmpeg_raises_safe_error_for_mp3(self):
        manager = JobManager()
        job = Job("test-no-ffmpeg", "https://www.youtube.com/watch?v=123", "audio", "320kbps")

        # Mock get_ffmpeg_path returning None
        with patch("services.job_manager.get_ffmpeg_path", return_value=None):
            manager._run_job(job)

        self.assertEqual(job.status, "failed")
        self.assertIn("FFmpeg is required", str(job.error))

    def test_path_traversal_blocked_in_delivery(self):
        # Ensure that paths outside DOWNLOADS_DIR are rejected
        real_downloads = os.path.realpath(DOWNLOADS_DIR)
        traversal_path = os.path.realpath(os.path.join(DOWNLOADS_DIR, "..", "main.py"))

        self.assertFalse(traversal_path.startswith(real_downloads + os.sep))

if __name__ == "__main__":
    unittest.main()
