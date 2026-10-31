import unittest

from app.agent.code_execution import CodeRunRequest, LocalPythonRunner


class LocalPythonRunnerTests(unittest.TestCase):
    def setUp(self):
        self.runner = LocalPythonRunner()

    def test_captures_stdout_as_student_display_output(self):
        result = self.runner.run(CodeRunRequest(code='print("hello")'))

        self.assertEqual(result.exit_code, 0)
        self.assertFalse(result.timed_out)
        self.assertEqual(result.stdout, "hello\n")
        self.assertEqual(result.stderr, "")
        self.assertEqual(result.display_output, "hello\n")

    def test_passes_stdin_to_student_code(self):
        result = self.runner.run(
            CodeRunRequest(code='name = input()\nprint(f"hi {name}")', stdin="Ashish\n")
        )

        self.assertEqual(result.exit_code, 0)
        self.assertEqual(result.display_output, "hi Ashish\n")

    def test_captures_runtime_error_traceback(self):
        result = self.runner.run(CodeRunRequest(code="print(missing_name)"))

        self.assertNotEqual(result.exit_code, 0)
        self.assertIn("NameError", result.stderr)
        self.assertIn("NameError", result.display_output)

    def test_captures_syntax_error(self):
        result = self.runner.run(CodeRunRequest(code='if True print("bad")'))

        self.assertNotEqual(result.exit_code, 0)
        self.assertIn("SyntaxError", result.stderr)
        self.assertIn("SyntaxError", result.display_output)

    def test_times_out_long_running_code(self):
        result = self.runner.run(
            CodeRunRequest(code="while True:\n    pass", timeout_seconds=0.2)
        )

        self.assertTrue(result.timed_out)
        self.assertIn("Execution timed out after 0.2 seconds.", result.stderr)
        self.assertIn("Execution timed out after 0.2 seconds.", result.display_output)

    def test_truncates_large_output(self):
        result = self.runner.run(
            CodeRunRequest(code='print("x" * 100)', max_output_chars=40)
        )

        self.assertTrue(result.output_truncated)
        self.assertTrue(result.display_output.endswith("[output truncated]"))
        self.assertLessEqual(len(result.display_output), 40)

    def test_rejects_invalid_timeout(self):
        with self.assertRaisesRegex(ValueError, "timeout_seconds"):
            self.runner.run(CodeRunRequest(code='print("hello")', timeout_seconds=0))


if __name__ == "__main__":
    unittest.main()
