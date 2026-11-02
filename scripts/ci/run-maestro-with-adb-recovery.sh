#!/usr/bin/env bash
set -euo pipefail

label="$1"
shift

for attempt in 1 2; do
  adb reconnect offline || true
  state=""
  for ready_check in $(seq 1 15); do
    state="$(adb get-state 2>/dev/null || true)"
    [[ "$state" == "device" ]] && break
    sleep 2
  done

  if [[ "$state" != "device" ]]; then
    echo "Android emulator did not become ready for '$label' (state: ${state:-unknown})." >&2
    if [[ "$attempt" -eq 2 ]]; then exit 1; fi
    adb kill-server || true
    adb start-server
    continue
  fi

  output_file="$(mktemp)"
  if "$@" 2>&1 | tee "$output_file"; then
    rm -f "$output_file"
    exit 0
  else
    status=$?
  fi

  state="$(adb get-state 2>/dev/null || true)"
  transport_failed=false
  if grep -Eq 'device offline|DeviceServerDiedException|device server died|UNAVAILABLE' "$output_file"; then
    transport_failed=true
  fi
  rm -f "$output_file"

  if [[ "$attempt" -eq 2 ]] || { [[ "$state" != "device" ]] && [[ "$transport_failed" == false ]]; }; then
    echo "Maestro flow '$label' failed (device state: ${state:-unknown}, exit: $status)." >&2
    exit "$status"
  fi

  echo "ADB transport failed during '$label'; restarting ADB transport and retrying once." >&2
  adb kill-server || true
  adb start-server
done
