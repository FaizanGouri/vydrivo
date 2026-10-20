import unittest
import socket
from services.security import (
    validate_url,
    validate_dns_resolution,
    is_hostname_allowed,
    is_ip_disallowed,
    SecurityValidationError,
    sanitize_filename,
)
import ipaddress

class TestSecurity(unittest.TestCase):

    def test_valid_platform_urls(self):
        valid_urls = [
            "https://www.youtube.com/watch?v=jNQXAC9IVRw",
            "https://youtu.be/jNQXAC9IVRw",
            "https://m.youtube.com/watch?v=jNQXAC9IVRw",
            "https://youtube.com/shorts/abcdef12345",
            "https://www.instagram.com/reel/C_abc12345/",
            "https://www.instagram.com/p/C_abc12345/",
            "https://www.facebook.com/watch/?v=123456789",
            "https://fb.watch/abcdef123/",
            "https://www.pinterest.com/pin/123456789012345678/",
            "https://pin.it/3q6O3t6TU",
            "https://in.pinterest.com/pin/1234567890/",
        ]
        for url in valid_urls:
            with self.subTest(url=url):
                res = validate_url(url, require_dns_check=False)
                self.assertEqual(res, url)

    def test_reject_disallowed_schemes(self):
        invalid_schemes = [
            "http://www.youtube.com/watch?v=123",
            "file:///etc/passwd",
            "ftp://files.youtube.com/video.mp4",
            "gopher://youtube.com",
            "javascript:alert(1)",
            "data:text/html,<h1>Test</h1>",
        ]
        for url in invalid_schemes:
            with self.subTest(url=url):
                with self.assertRaises(SecurityValidationError):
                    validate_url(url, require_dns_check=False)

    def test_reject_credentials_in_url(self):
        urls_with_creds = [
            "https://user:password@www.youtube.com/watch?v=123",
            "https://admin@instagram.com/reel/123",
            "https://user:pass@pin.it/123",
        ]
        for url in urls_with_creds:
            with self.subTest(url=url):
                with self.assertRaises(SecurityValidationError):
                    validate_url(url, require_dns_check=False)

    def test_reject_lookalike_and_unauthorized_domains(self):
        unauthorized = [
            "https://evil-youtube.com/watch?v=123",
            "https://youtube.com.attacker.com/watch?v=123",
            "https://instagram.com.evil.org/reel/123",
            "https://fake-facebook.com/video",
            "https://attacker-pinterest.com/pin/123",
            "https://google.com",
            "https://github.com",
            "https://127.0.0.1:8000/api",
        ]
        for url in unauthorized:
            with self.subTest(url=url):
                with self.assertRaises(SecurityValidationError):
                    validate_url(url, require_dns_check=False)

    def test_private_and_cloud_metadata_ip_blocking(self):
        disallowed_ips = [
            "127.0.0.1",
            "127.0.1.1",
            "10.0.0.1",
            "10.254.1.1",
            "172.16.0.1",
            "172.31.255.255",
            "192.168.0.1",
            "192.168.1.100",
            "169.254.169.254", # AWS/GCP metadata
            "169.254.170.2",   # ECS metadata
            "0.0.0.0",
            "::1",
            "fc00::1",
            "fe80::1",
        ]
        for ip_str in disallowed_ips:
            with self.subTest(ip=ip_str):
                ip = ipaddress.ip_address(ip_str)
                self.assertTrue(is_ip_disallowed(ip))

    def test_public_ips_allowed(self):
        public_ips = [
            "8.8.8.8",
            "1.1.1.1",
            "142.250.190.46", # google.com
            "157.240.22.35",  # facebook/instagram
        ]
        for ip_str in public_ips:
            with self.subTest(ip=ip_str):
                ip = ipaddress.ip_address(ip_str)
                self.assertFalse(is_ip_disallowed(ip))

    def test_sanitize_filename(self):
        test_cases = [
            ("../../../etc/passwd", "passwd"),
            ("..\\..\\windows\\system32\\cmd.exe", "cmd.exe"),
            ("My Video: Super *HD* <Awesome>?.mp4", "My Video_ Super _HD_ _Awesome__.mp4"),
            ("", "media_file"),
            ("normal_video_title.mp4", "normal_video_title.mp4"),
        ]
        for raw, expected in test_cases:
            with self.subTest(raw=raw):
                self.assertEqual(sanitize_filename(raw), expected)

if __name__ == "__main__":
    unittest.main()
