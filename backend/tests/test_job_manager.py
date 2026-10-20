import unittest
import time
import os
from unittest.mock import patch
from services.job_manager import Job, JobManager, QueueFullError, DOWNLOADS_DIR, MAX_QUEUE_CAPACITY

class TestJobManager(unittest.TestCase):

    def test_job_valid_state_transitions(self):
        job = Job("test-1", "https://youtube.com/watch?v=123", "video", "1080p")
        self.assertEqual(job.status, "queued")

        # queued -> processing
        self.assertTrue(job.set_status("processing"))
        self.assertEqual(job.status, "processing")

        # processing -> completed
        self.assertTrue(job.set_status("completed"))
        self.assertEqual(job.status, "completed")

        # completed cannot transition again
        self.assertFalse(job.set_status("processing"))
        self.assertFalse(job.set_status("failed"))
        self.assertEqual(job.status, "completed")

    def test_job_invalid_state_transitions(self):
        job = Job("test-2", "https://youtube.com/watch?v=123", "video", "1080p")
        # Cannot jump from queued directly to completed
        self.assertFalse(job.set_status("completed"))
        self.assertEqual(job.status, "queued")

        # queued -> cancelled
        self.assertTrue(job.set_status("cancelled"))
        self.assertEqual(job.status, "cancelled")

        # cancelled cannot transition
        self.assertFalse(job.set_status("processing"))

    def test_job_cancellation(self):
        job = Job("test-3", "https://youtube.com/watch?v=123", "video", "1080p")
        job.cancel()
        self.assertTrue(job.is_cancelled)
        self.assertEqual(job.status, "cancelled")

    def test_progress_clamping(self):
        job = Job("test-4", "https://youtube.com/watch?v=123", "video", "1080p")
        job.set_status("processing")
        job.update_progress(150.0)
        self.assertEqual(job.progress, 100.0)

        job.update_progress(-20.0)
        self.assertEqual(job.progress, 0.0)

        job.update_progress(45.678)
        self.assertEqual(job.progress, 45.7)

    def test_stale_disk_purging(self):
        dummy_name = "test_stale_purge_dummy.tmp"
        dummy_path = os.path.join(DOWNLOADS_DIR, dummy_name)
        with open(dummy_path, "w") as f:
            f.write("test")

        two_hours_ago = time.time() - 7200
        os.utime(dummy_path, (two_hours_ago, two_hours_ago))

        manager = JobManager()
        manager._purge_stale_disk_files(max_age_seconds=1800)

        self.assertFalse(os.path.exists(dummy_path))

    def test_partial_cleanup_on_failure(self):
        manager = JobManager()
        job = Job("test-partial-clean", "https://www.youtube.com/watch?v=123", "video", "1080p")

        # Simulate a partial file dropped during download
        partial_file = os.path.join(DOWNLOADS_DIR, f"{job.job_id}_test.part")
        with open(partial_file, "w") as f:
            f.write("partial data")

        self.assertTrue(os.path.exists(partial_file))

        # Force a failure in _run_job by pointing to a failing yt-dlp
        with patch("yt_dlp.YoutubeDL") as mock_ydl:
            mock_ydl.return_value.__enter__.return_value.extract_info.side_effect = Exception("Simulated network crash")
            manager._run_job(job)

        self.assertEqual(job.status, "failed")
        # Ensure the partial artifact was deleted
        self.assertFalse(os.path.exists(partial_file))

    def test_queue_capacity_limit(self):
        manager = JobManager()
        # Saturate queue with dummy jobs in 'queued' state
        manager.jobs.clear()
        for i in range(MAX_QUEUE_CAPACITY):
            j = Job(f"dummy-{i}", "https://youtube.com/watch?v=123", "video", "1080p")
            manager.jobs[j.job_id] = j

        # Next job creation should raise QueueFullError
        with self.assertRaises(QueueFullError):
            manager.create_job("https://youtube.com/watch?v=123", "video", "1080p")

    def test_download_job_ydl_options_configuration(self):
        manager = JobManager()
        job = Job("test-ydl-opts", "https://www.youtube.com/watch?v=123", "video", "1080p")
        with patch("yt_dlp.YoutubeDL") as mock_ydl_class:
            mock_ydl = mock_ydl_class.return_value.__enter__.return_value
            mock_ydl.download.return_value = 0
            manager._run_job(job)

            call_args = mock_ydl_class.call_args[0][0]
            # Ensure no explicit player_client override (preserving yt-dlp default selection)
            self.assertNotIn("extractor_args", call_args)
            self.assertFalse(call_args.get("no_warnings", True))
            self.assertIsNotNone(call_args.get("logger"))
            self.assertIn("js_runtimes", call_args)
            self.assertIn("deno", call_args["js_runtimes"])

    def test_job_failure_maps_429_to_rate_limit_error(self):
        manager = JobManager()
        job = Job("test-429-job", "https://www.youtube.com/watch?v=123", "video", "1080p")
        with patch("yt_dlp.YoutubeDL") as mock_ydl_class:
            mock_ydl = mock_ydl_class.return_value.__enter__.return_value
            mock_ydl.extract_info.side_effect = Exception("HTTP Error 429: Too Many Requests for URL https://googlevideo.com/...")
            manager._run_job_wrapper(job)

            self.assertEqual(job.status, "failed")
            self.assertIn("rate-limiting", job.error)
            self.assertNotIn("googlevideo.com", job.error)

if __name__ == "__main__":
    unittest.main()
