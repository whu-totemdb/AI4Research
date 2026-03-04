#!/bin/bash
curl -s -X POST http://localhost:8000/api/papers/2/explore-authors --max-time 120 > /tmp/explore_output.txt 2>&1 &
CPID=$!
sleep 20
echo "=== BACKEND LOGS ==="
tail -30 /tmp/backend.log
echo "=== CURL OUTPUT ==="
cat /tmp/explore_output.txt
wait $CPID 2>/dev/null
echo "=== FINAL OUTPUT ==="
cat /tmp/explore_output.txt
