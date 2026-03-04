#!/usr/bin/env python3
"""
Terminal Server for Claude Code Docker Environment
"""

import asyncio
import json
import logging
from aiohttp import web
from aiohttp_cors import setup as cors_setup, ResourceOptions

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TerminalServer:
    def __init__(self, host='0.0.0.0', port=8000):
        self.host = host
        self.port = port
        self.app = web.Application()
        self.setup_routes()
        self.setup_cors()

    def setup_cors(self):
        """Setup CORS to allow frontend access"""
        cors = cors_setup(self.app, defaults={
            "*": ResourceOptions(
                allow_credentials=True,
                expose_headers="*",
                allow_headers="*",
                allow_methods="*"
            )
        })

        # Apply CORS to all routes
        for route in list(self.app.router.routes()):
            cors.add(route)

    def setup_routes(self):
        self.app.router.add_get('/', self.handle_index)
        self.app.router.add_post('/execute', self.handle_execute)
        self.app.router.add_get('/health', self.handle_health)

    async def handle_index(self, request):
        return web.Response(text="Claude Code Terminal Server")

    async def handle_health(self, request):
        return web.json_response({'status': 'healthy'})

    async def handle_execute(self, request):
        try:
            data = await request.json()
            command = data.get('command', '')

            logger.info(f"Executing command: {command}")

            # Execute command
            process = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd='/workspace'
            )

            stdout, stderr = await process.communicate()

            return web.json_response({
                'stdout': stdout.decode('utf-8'),
                'stderr': stderr.decode('utf-8'),
                'returncode': process.returncode
            })

        except Exception as e:
            logger.error(f"Error executing command: {e}")
            return web.json_response({
                'error': str(e)
            }, status=500)

    def run(self):
        logger.info(f"Starting terminal server on {self.host}:{self.port}")
        web.run_app(self.app, host=self.host, port=self.port)


if __name__ == '__main__':
    server = TerminalServer()
    server.run()
