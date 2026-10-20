import unittest
from unittest.mock import patch, MagicMock
from services.youtube import extract_video_info

class TestExtraction(unittest.TestCase):

    @patch("yt_dlp.YoutubeDL")
    def test_youtube_video_extraction_mock(self, mock_ydl_class):
        mock_ydl = MagicMock()
        mock_ydl_class.return_value.__enter__.return_value = mock_ydl

        mock_ydl.extract_info.return_value = {
            "id": "dQw4w9WgXcQ",
            "title": "Rick Astley - Never Gonna Give You Up",
            "thumbnail": "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
            "duration": 213,
            "uploader": "RickAstleyVEVO",
            "view_count": 1500000000,
            "formats": [
                {"height": 1080, "vcodec": "avc1", "ext": "mp4"},
                {"height": 720, "vcodec": "avc1", "ext": "mp4"},
                {"height": 360, "vcodec": "avc1", "ext": "mp4"},
                {"format_id": "140", "vcodec": "none", "acodec": "mp4a", "ext": "m4a"},
            ]
        }

        info = extract_video_info("https://www.youtube.com/watch?v=dQw4w9WgXcQ")

        self.assertIsNotNone(info)
        self.assertEqual(info["id"], "dQw4w9WgXcQ")
        self.assertEqual(info["title"], "Rick Astley - Never Gonna Give You Up")
        self.assertEqual(info["duration_formatted"], "3:33")
        self.assertEqual(info["platform"], "youtube")
        
        # Check option qualities
        qualities = [o["quality"] for o in info["options"]]
        self.assertIn("1080p", qualities)
        self.assertIn("720p", qualities)
        self.assertIn("360p", qualities)
        self.assertIn("320kbps", qualities)
        self.assertIn("128kbps", qualities)

    @patch("yt_dlp.YoutubeDL")
    def test_instagram_reel_extraction_mock(self, mock_ydl_class):
        mock_ydl = MagicMock()
        mock_ydl_class.return_value.__enter__.return_value = mock_ydl

        mock_ydl.extract_info.return_value = {
            "id": "C_test123",
            "title": "Scenic Mountain View",
            "thumbnail": "https://scontent.cdninstagram.com/v/test.jpg",
            "duration": 30,
            "uploader": "nature_photographer",
            "formats": [
                {"vcodec": "avc1", "acodec": "mp4a", "ext": "mp4"},
            ]
        }

        info = extract_video_info("https://www.instagram.com/reel/C_test123/")

        self.assertIsNotNone(info)
        self.assertEqual(info["platform"], "instagram")
        self.assertTrue(info["is_short"])
        
        types = [o["type"] for o in info["options"]]
        self.assertIn("video", types)
        self.assertIn("audio", types)
        self.assertIn("image", types)

    @patch("yt_dlp.YoutubeDL")
    def test_youtube_shorts_extraction_mock(self, mock_ydl_class):
        mock_ydl = MagicMock()
        mock_ydl_class.return_value.__enter__.return_value = mock_ydl

        mock_ydl.extract_info.return_value = {
            "id": "0ZX0jCAvfPY",
            "title": "How to Deploy a NextJS Website to Vercel",
            "thumbnail": "https://i.ytimg.com/vi/0ZX0jCAvfPY/maxresdefault.jpg",
            "duration": 58,
            "uploader": "Developer",
            "view_count": 50000,
            "formats": [
                {"height": 1080, "vcodec": "avc1", "ext": "mp4"},
                {"format_id": "140", "vcodec": "none", "acodec": "mp4a", "ext": "m4a"},
            ]
        }

        info = extract_video_info("https://www.youtube.com/shorts/0ZX0jCAvfPY")

        self.assertIsNotNone(info)
        self.assertEqual(info["id"], "0ZX0jCAvfPY")
        self.assertTrue(info["is_short"])
        self.assertEqual(info["platform"], "youtube")
        
        # Verify that extract_info was called with normalized watch URL
        mock_ydl.extract_info.assert_called_with("https://www.youtube.com/watch?v=0ZX0jCAvfPY", download=False)
        
        # Verify extractor_args includes android client fallback and remote challenge solver
        call_args = mock_ydl_class.call_args[0][0]
        self.assertIn("extractor_args", call_args)
        self.assertEqual(call_args["extractor_args"]["youtube"]["player_client"], ['web_embedded'])
        self.assertEqual(call_args.get("remote_components"), {'ejs:github'})
        self.assertFalse(call_args.get("no_warnings", True))
        self.assertIsNotNone(call_args.get("logger"))
        self.assertIn("js_runtimes", call_args)
        self.assertIn("deno", call_args["js_runtimes"])

    def test_sanitized_logger_tracks_429_and_403_flags(self):
        from services.youtube import SanitizedYTDLPLogger
        logger = SanitizedYTDLPLogger()
        self.assertFalse(logger.encountered_429)
        self.assertFalse(logger.encountered_403)

        logger.warning("WARNING: [youtube] HTTP Error 429: Too Many Requests. Retrying (1/3)...")
        self.assertTrue(logger.encountered_429)

        logger.error("ERROR: [youtube] HTTP Error 403: Forbidden")
        self.assertTrue(logger.encountered_403)

    @patch("services.youtube.extract_youtube_oembed", return_value=None)
    @patch("yt_dlp.YoutubeDL")
    def test_extract_video_info_raises_rate_limit_error_on_429_warning(self, mock_ydl_class, mock_oembed):
        from services.youtube import MediaProviderRateLimitError
        mock_ydl = MagicMock()
        mock_ydl_class.return_value.__enter__.return_value = mock_ydl

        def simulate_429_then_fail(url, download=False):
            # Simulate yt-dlp logger recording 429 warning during extraction
            ydl_instance_logger = mock_ydl_class.call_args[0][0]['logger']
            ydl_instance_logger.warning("HTTP Error 429: Too Many Requests")
            raise Exception("Failed to extract any player response")

        mock_ydl.extract_info.side_effect = simulate_429_then_fail

        with self.assertRaises(MediaProviderRateLimitError):
            extract_video_info("https://www.youtube.com/watch?v=0ZX0jCAvfPY")

    @patch("yt_dlp.YoutubeDL")
    def test_extract_video_info_falls_back_to_oembed_on_rate_limit(self, mock_ydl_class):
        mock_ydl = MagicMock()
        mock_ydl_class.return_value.__enter__.return_value = mock_ydl
        mock_ydl.extract_info.side_effect = Exception("HTTP Error 429: Too Many Requests")

        info = extract_video_info("https://www.youtube.com/watch?v=0ZX0jCAvfPY")
        self.assertIsNotNone(info)
        self.assertEqual(info["id"], "0ZX0jCAvfPY")
        self.assertEqual(info["title"], "How to Deploy a NextJS Website to Vercel")
        self.assertEqual(info["platform"], "youtube")
        self.assertTrue(len(info["options"]) > 0)

    def test_js_runtime_configuration(self):
        import os
        from services.youtube import get_js_runtime_config
        cfg = get_js_runtime_config()
        self.assertIn("deno", cfg)
        if "path" in cfg["deno"]:
            self.assertTrue(os.path.exists(cfg["deno"]["path"]))

    def test_sanitized_logger_redacts_tokens_and_keys(self):
        from services.youtube import SanitizedYTDLPLogger
        sanitize = SanitizedYTDLPLogger.sanitize_message

        # Plain token and key parameters
        msg1 = "Failed to fetch player with po_token=abc123XYZ and key=AIzaSySecretKey"
        sanitized1 = sanitize(msg1)
        self.assertNotIn("abc123XYZ", sanitized1)
        self.assertNotIn("AIzaSySecretKey", sanitized1)
        self.assertIn("po_token=[REDACTED]", sanitized1)
        self.assertIn("key=[REDACTED]", sanitized1)

        # visitor_data, sig, and signature
        msg2 = "HTTP 403: visitor_data=Cgt2SVB1a2w%3D%3D sig=secret_sig_99 signature=sig_full_123"
        sanitized2 = sanitize(msg2)
        self.assertNotIn("secret_sig_99", sanitized2)
        self.assertNotIn("sig_full_123", sanitized2)
        self.assertIn("sig=[REDACTED]", sanitized2)
        self.assertIn("signature=[REDACTED]", sanitized2)

    def test_sanitized_logger_redacts_url_encoded_parameters(self):
        from services.youtube import SanitizedYTDLPLogger
        sanitize = SanitizedYTDLPLogger.sanitize_message

        # URL-encoded parameter delimiters (%3D)
        msg = "Extractor warning: client returned po_token%3DTopSecretToken123 in payload"
        sanitized = sanitize(msg)
        self.assertNotIn("TopSecretToken123", sanitized)
        self.assertIn("po_token=[REDACTED]", sanitized)

    def test_sanitized_logger_redacts_query_strings_in_urls(self):
        from services.youtube import SanitizedYTDLPLogger
        sanitize = SanitizedYTDLPLogger.sanitize_message

        # Full URL containing sensitive query parameters in exception message
        raw_url = "https://rr1---sn-5goz-nxbe.googlevideo.com/videoplayback?expire=171000&ei=ABC&ip=1.2.3.4&sig=MY_SIG&po_token=MY_POT"
        msg = f"DownloadError: Connection reset during GET {raw_url}"
        sanitized = sanitize(msg)

        # Complete sensitive query string must be stripped
        self.assertNotIn("expire=171000", sanitized)
        self.assertNotIn("MY_SIG", sanitized)
        self.assertNotIn("MY_POT", sanitized)
        self.assertIn("https://rr1---sn-5goz-nxbe.googlevideo.com/videoplayback?[QUERY_REDACTED]", sanitized)

    def test_sanitized_logger_handles_urls_followed_by_punctuation(self):
        from services.youtube import SanitizedYTDLPLogger
        sanitize = SanitizedYTDLPLogger.sanitize_message

        # URL followed by trailing period, comma, closing parenthesis, or quote
        msg1 = "Failed to fetch https://googlevideo.com/videoplayback?expire=123&sig=SECRET_SIG."
        sanitized1 = sanitize(msg1)
        self.assertNotIn("SECRET_SIG", sanitized1)
        self.assertTrue(sanitized1.endswith("?[QUERY_REDACTED]."))

        msg2 = "See (source: https://googlevideo.com/videoplayback?sig=SECRET_SIG) for details."
        sanitized2 = sanitize(msg2)
        self.assertNotIn("SECRET_SIG", sanitized2)
        self.assertIn("https://googlevideo.com/videoplayback?[QUERY_REDACTED])", sanitized2)

    def test_sanitized_logger_handles_multiple_urls_in_one_message(self):
        from services.youtube import SanitizedYTDLPLogger
        sanitize = SanitizedYTDLPLogger.sanitize_message

        # Multiple URLs in one message
        msg = (
            "Primary URL: https://primary.googlevideo.com/videoplayback?sig=SIG1&po_token=POT1 "
            "and fallback URL: https://fallback.googlevideo.com/videoplayback?sig=SIG2&po_token=POT2"
        )
        sanitized = sanitize(msg)
        self.assertNotIn("SIG1", sanitized)
        self.assertNotIn("POT1", sanitized)
        self.assertNotIn("SIG2", sanitized)
        self.assertNotIn("POT2", sanitized)
        self.assertIn("https://primary.googlevideo.com/videoplayback?[QUERY_REDACTED]", sanitized)
        self.assertIn("https://fallback.googlevideo.com/videoplayback?[QUERY_REDACTED]", sanitized)

    def test_sanitized_logger_handles_encoded_query_delimiters(self):
        from services.youtube import SanitizedYTDLPLogger
        sanitize = SanitizedYTDLPLogger.sanitize_message

        # URL with encoded %3F query delimiter and %26 / %3D parameter delimiters
        msg = "Trace: GET https://manifest.googlevideo.com/api%3Fsig%3DENC_SIG%26po_token%3DENC_POT"
        sanitized = sanitize(msg)
        self.assertNotIn("ENC_SIG", sanitized)
        self.assertNotIn("ENC_POT", sanitized)
        self.assertIn("https://manifest.googlevideo.com/api%3F[QUERY_REDACTED]", sanitized)

    def test_sanitized_logger_categorizes_known_diagnostics(self):
        from services.youtube import SanitizedYTDLPLogger
        sanitize = SanitizedYTDLPLogger.sanitize_message

        # JS runtime warning
        js_warn = (
            "[youtube] No supported JavaScript runtime could be found. Only deno is enabled by default; "
            "to use another runtime add --js-runtimes RUNTIME[:PATH] to your command/config. "
            "See https://github.com/yt-dlp/yt-dlp/wiki/EJS for details on installing one"
        )
        self.assertEqual(
            sanitize(js_warn),
            "Missing JavaScript runtime for YouTube challenge solving (EJS)"
        )

        # SABR format skipping
        sabr_warn = (
            "Some ios client https formats have been skipped as they are missing a URL. "
            "YouTube may have enabled the SABR-only streaming experiment. See https://github.com/yt-dlp/yt-dlp/issues/12482"
        )
        self.assertEqual(
            sanitize(sabr_warn),
            "SABR streaming restriction: formats skipped for client 'ios'"
        )

        # PO Token warning
        pot_warn = (
            "mweb client https formats require a GVS PO Token which was not provided. "
            "They will be skipped. See https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide"
        )
        self.assertEqual(
            sanitize(pot_warn),
            "PO Token restriction: GVS PO Token required for client 'mweb'"
        )

        # HTTP error with nested URL
        http_err = (
            "yt_dlp.utils.ExtractorError: [youtube] 0ZX0jCAvfPY: HTTP Error 403: Forbidden "
            "for URL 'https://rr1---sn-5goz-nxbe.googlevideo.com/videoplayback?expire=999&sig=DEEP_SIG&po_token=DEEP_POT'"
        )
        self.assertEqual(
            sanitize(http_err),
            "YouTube HTTP Error 403: Forbidden"
        )

    def test_categorize_message_drops_secrets_and_ips_in_matched_categories(self):
        from services.youtube import SanitizedYTDLPLogger
        sanitize = SanitizedYTDLPLogger.sanitize_message

        # HTTP error accompanied by IP address and tokens
        raw_http_msg = "HTTP Error 429: Too Many Requests for URL https://googlevideo.com/v?ip=1.2.3.4&token=SUPER_SECRET"
        res = sanitize(raw_http_msg)
        self.assertEqual(res, "YouTube HTTP Error 429: Too Many Requests")
        self.assertNotIn("1.2.3.4", res)
        self.assertNotIn("SUPER_SECRET", res)

        # Unrecognized client name in SABR format skip
        injection_sabr = "Some evil_payload client https formats have been skipped"
        self.assertEqual(
            sanitize(injection_sabr),
            "SABR streaming restriction: formats skipped for client 'unknown'"
        )

        # Private video and DRM playability statuses
        self.assertEqual(
            sanitize("Sign in to confirm your age. This video may be inappropriate"),
            "YouTube extraction diagnostic: Age-restricted video requires authentication"
        )
        self.assertEqual(
            sanitize("Private video. Sign in if you've been granted access"),
            "YouTube extraction diagnostic: Video is private"
        )
        self.assertEqual(
            sanitize("This video is DRM protected"),
            "YouTube extraction diagnostic: Video is DRM protected"
        )

    def test_sanitized_logger_handles_nested_exception_messages(self):
        from services.youtube import SanitizedYTDLPLogger
        sanitize = SanitizedYTDLPLogger.sanitize_message

        # Unclassified nested exception string with embedded quotes and multiple parameters
        exc_msg = (
            "yt_dlp.utils.ExtractorError: Connection reset "
            "for URL 'https://rr1---sn-5goz-nxbe.googlevideo.com/videoplayback?expire=999&sig=DEEP_SIG&po_token=DEEP_POT'"
        )
        sanitized = sanitize(exc_msg)
        self.assertNotIn("DEEP_SIG", sanitized)
        self.assertNotIn("DEEP_POT", sanitized)
        self.assertIn("https://rr1---sn-5goz-nxbe.googlevideo.com/videoplayback?[QUERY_REDACTED]'", sanitized)

if __name__ == "__main__":
    unittest.main()
