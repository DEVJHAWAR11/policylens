"""Run the eval against a deployed RAG service, loading INTERNAL_API_KEY from .env (never printed)."""
import os
import runpy
import sys

from dotenv import dotenv_values

os.environ["INTERNAL_API_KEY"] = dotenv_values(".env").get("INTERNAL_API_KEY", "")
sys.argv = ["run_eval", "--remote", sys.argv[1], *sys.argv[2:]]
runpy.run_module("eval.run_eval", run_name="__main__")
