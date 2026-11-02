#!/usr/bin/env bash
set -euo pipefail

label="$1"
shift

adb_state() {
  adb get-state 2>/dev/null || true
}

adb_transport_ready() {
  local booted
  [[ "$(adb_state)" == "device" ]] || return 1
  booted="$(timeout 10s adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
  [[ "$booted" == "1" ]]
}

wait_for_adb_transport() {
  adb reconnect offline >/dev/null 2>&1 || true
  for ready_check in $(seq 1 30); do
    if adb_transport_ready; then
      return 0
    fi
    if (( ready_check % 5 == 0 )); then
      adb reconnect offline >/dev/null 2>&1 || true
    fi
    sleep 2
  done
  return 1
}

restart_adb() {
  adb kill-server || true
  adb start-server || true
  sleep 3
}

for attempt in 1 2 3; do
  state=""
  if ! wait_for_adb_transport; then
    state="$(adb_state)"
    echo "Android emulator transport did not become ready for '$label' on attempt $attempt (state: ${state:-unknown})." >&2
    if [[ "$attempt" -eq 3 ]]; then exit 1; fi
    restart_adb
    continue
  fi

  output_file="$(mktemp)"
  if "$@" 2>&1 | tee "$output_file"; then
    rm -f "$output_file"
    exit 0
  else
    status=$?
  fi

  state="$(adb_state)"
  transport_failed=false
  if grep -Eq 'device offline|DeviceServerDiedException|device server died|UNAVAILABLE' "$output_file"; then
    transport_failed=true
  fi
  if ! adb_transport_ready; then
    transport_failed=true
  fi
  rm -f "$output_file"

  if [[ "$attempt" -eq 3 ]] || [[ "$transport_failed" == false ]]; then
    echo "Maestro flow '$label' failed (device state: ${state:-unknown}, exit: $status)." >&2
    exit "$status"
  fi

  echo "ADB transport failed during '$label'; restarting ADB transport and retrying." >&2
  restart_adb
done
