"""
HTTP Request Node

Makes HTTP requests to external APIs.
"""

import sys
import json
import asyncio
from pathlib import Path

# Add SDK to path for development
sdk_path = Path(__file__).parent.parent.parent / "packages" / "sdk"
if str(sdk_path) not in sys.path:
    sys.path.insert(0, str(sdk_path))

from aituber_flow_sdk import BaseNode, NodeContext

try:
    import aiohttp
except ImportError:
    aiohttp = None


class HttpRequestNode(BaseNode):
    """
    HTTP Request Node

    Makes HTTP requests to external APIs.
    """

    def __init__(self):
        self.url = ""
        self.method = "GET"
        self.headers = {}
        self.timeout = 30000

    async def setup(self, config: dict, context: NodeContext) -> None:
        """Initialize with configuration."""
        self.url = config.get("url", "")
        self.method = config.get("method", "GET")
        self.timeout = config.get("timeout", 30000)

        # Parse headers from JSON string
        headers_str = config.get("headers", "{}")
        try:
            self.headers = json.loads(headers_str) if headers_str else {}
        except json.JSONDecodeError:
            self.headers = {}
            await context.log("Invalid headers JSON, using empty headers", "warning")

        await context.log(f"HTTP Request configured: {self.method} {self.url}")

    async def execute(self, inputs: dict, context: NodeContext) -> dict:
        """Execute the HTTP request."""
        if not self.url:
            await context.log("No URL configured", "error")
            return {"response": None, "status": 0}

        if aiohttp is None:
            await context.log("aiohttp not installed, using urllib", "warning")
            return await self._execute_urllib(inputs, context)

        body = inputs.get("body")

        await context.log(f"Sending {self.method} request to {self.url}")

        try:
            timeout = aiohttp.ClientTimeout(total=self.timeout / 1000)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                kwargs = {
                    "headers": self.headers
                }

                if body is not None and self.method in ["POST", "PUT", "PATCH"]:
                    if isinstance(body, (dict, list)):
                        kwargs["json"] = body
                    else:
                        kwargs["data"] = str(body)

                async with session.request(self.method, self.url, **kwargs) as response:
                    status = response.status

                    # Try to parse as JSON, fallback to text
                    try:
                        data = await response.json()
                    except:
                        data = await response.text()

                    await context.log(f"Response received: {status}")
                    return {"response": data, "status": status}

        except asyncio.TimeoutError:
            await context.log(f"Request timed out after {self.timeout}ms", "error")
            return {"response": None, "status": 0}
        except Exception as e:
            await context.log(f"Request failed: {str(e)}", "error")
            return {"response": None, "status": 0}

    async def _execute_urllib(self, inputs: dict, context: NodeContext) -> dict:
        """Fallback using urllib for when aiohttp is not available."""
        import urllib.request
        import urllib.error

        body = inputs.get("body")

        try:
            req = urllib.request.Request(self.url, method=self.method)

            for key, value in self.headers.items():
                req.add_header(key, value)

            data = None
            if body is not None and self.method in ["POST", "PUT", "PATCH"]:
                if isinstance(body, (dict, list)):
                    data = json.dumps(body).encode('utf-8')
                    req.add_header('Content-Type', 'application/json')
                else:
                    data = str(body).encode('utf-8')

            with urllib.request.urlopen(req, data=data, timeout=self.timeout / 1000) as response:
                status = response.status
                response_data = response.read().decode('utf-8')

                try:
                    response_data = json.loads(response_data)
                except:
                    pass

                return {"response": response_data, "status": status}

        except urllib.error.HTTPError as e:
            await context.log(f"HTTP Error: {e.code}", "error")
            return {"response": None, "status": e.code}
        except Exception as e:
            await context.log(f"Request failed: {str(e)}", "error")
            return {"response": None, "status": 0}

    async def teardown(self) -> None:
        """No cleanup needed."""
        pass
