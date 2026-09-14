#!/usr/bin/env python3
"""Regression check against the running app's local HTTP server, no printer calls."""
import os
import socket
import time

port = int(os.environ.get('U1_HTTP_PORT', '13619'))
request = (
    'GET /web/model-library/library.js HTTP/1.1\r\n'
    f'Host: 127.0.0.1:{port}\r\n'
    'Connection: close\r\n'
    '\r\n'
).encode()
# Every CRLF boundary, including the last header terminator. The old reader
# times out when CR and LF of that header arrive separately.
splits = [None] + [i + 1 for i in range(len(request) - 1) if request[i:i + 2] == b'\r\n']
for split in splits:
    with socket.create_connection(('127.0.0.1', port), timeout=3) as connection:
        connection.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        connection.settimeout(3)
        if split is None:
            connection.sendall(request)
        else:
            connection.sendall(request[:split])
            time.sleep(0.05)
            connection.sendall(request[split:])
        chunks = []
        while True:
            chunk = connection.recv(65536)
            if not chunk:
                break
            chunks.append(chunk)
    headers, body = b''.join(chunks).split(b'\r\n\r\n', 1)
    assert headers.startswith(b'HTTP/1.1 200 '), (split, headers)
    length = next(int(line.split(b':', 1)[1]) for line in headers.split(b'\r\n') if line.lower().startswith(b'content-length:'))
    assert len(body) == length, (split, len(body), length)
    assert b'window.u1LibraryResponse' in body, split
print(f'PASS: complete request and {len(splits) - 1} split CRLF boundaries on port {port}.')
