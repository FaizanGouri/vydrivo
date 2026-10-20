import unittest
import requests

API_BASE = "http://127.0.0.1:8000/api/v1"

class TestAPIEndpoints(unittest.TestCase):

    def test_health_check(self):
        resp = requests.get(f"{API_BASE}/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data.get("status"), "ok")
        self.assertEqual(data.get("service"), "vydrivo-media-engine")

    def test_inspect_rejects_ssrf_and_invalid_urls(self):
        invalid_payloads = [
            {"url": "http://127.0.0.1:8000/api/v1/health"}, # Localhost SSRF
            {"url": "https://169.254.169.254/latest/meta-data/"}, # Cloud metadata SSRF
            {"url": "https://google.com/search?q=test"}, # Unsupported domain
            {"url": "file:///C:/Windows/system.ini"}, # File scheme
            {"url": "not_a_valid_url"}, # Malformed URL
        ]
        for payload in invalid_payloads:
            with self.subTest(payload=payload):
                resp = requests.post(f"{API_BASE}/inspect", json=payload)
                self.assertEqual(resp.status_code, 400)
                data = resp.json()
                self.assertIn("detail", data)
                # Verify no Python traceback leaks
                self.assertNotIn("Traceback", data["detail"])
                self.assertNotIn("File \"", data["detail"])

    def test_job_creation_schema_validation(self):
        # Invalid format type
        payload = {
            "url": "https://www.youtube.com/watch?v=jNQXAC9IVRw",
            "format": "invalid_format_xyz",
            "quality": "1080p"
        }
        resp = requests.post(f"{API_BASE}/jobs", json=payload)
        self.assertEqual(resp.status_code, 422)

    def test_job_not_found(self):
        resp = requests.get(f"{API_BASE}/jobs/00000000-0000-0000-0000-000000000000")
        self.assertEqual(resp.status_code, 404)
        self.assertIn("Job not found", resp.json()["detail"])

    def test_cancel_non_existent_job(self):
        resp = requests.post(f"{API_BASE}/jobs/00000000-0000-0000-0000-000000000000/cancel")
        self.assertEqual(resp.status_code, 404)

    def test_download_non_existent_job(self):
        resp = requests.get(f"{API_BASE}/jobs/00000000-0000-0000-0000-000000000000/download")
        self.assertEqual(resp.status_code, 404)

    def test_cors_options_preflight(self):
        headers = {
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type",
        }
        resp = requests.options(f"{API_BASE}/inspect", headers=headers)
        self.assertEqual(resp.status_code, 200)
        self.assertIn("Access-Control-Allow-Origin", resp.headers)
        self.assertEqual(resp.headers["Access-Control-Allow-Origin"], "http://localhost:3000")

if __name__ == "__main__":
    unittest.main()
