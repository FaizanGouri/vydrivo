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
        
        # Verify extractor_args were passed in constructor
        call_args = mock_ydl_class.call_args[0][0]
        self.assertIn("extractor_args", call_args)
        self.assertIn("youtube", call_args["extractor_args"])
        self.assertEqual(
            call_args["extractor_args"]["youtube"]["player_client"],
            ['ios', 'android', 'mweb', 'web']
        )

if __name__ == "__main__":
    unittest.main()
