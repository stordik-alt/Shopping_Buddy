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
  if adb_transport_ready; then
    return 0
  fi
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
  started_at="$(date +%s)"
  if "$@" 2>&1 | tee "$output_file"; then
    rm -f "$output_file"
    exit 0
  else
    status=$?
  fi
  elapsed=$(( $(date +%s) - started_at ))

  state="$(adb_state)"
  transport_failed=false
  if grep -Eq 'device offline|DeviceServerDiedException|device server died|UNAVAILABLE' "$output_file"; then
    transport_failed=true
  fi
  if grep -F 'Launch app "' "$output_file" | grep -vq 'COMPLETED'; then
    transport_failed=true
  fi
  if ! adb_transport_ready; then
    transport_failed=true
  fi

  if [[ "$attempt" -eq 3 ]] || [[ "$transport_failed" == false ]]; then
    tail -n 40 "$output_file" >&2
    rm -f "$output_file"
    echo "Maestro flow '$label' failed (device state: ${state:-unknown}, exit: $status)." >&2
    exit "$status"
  fi

  echo "Maestro flow '$label' hit an ADB transport failure after ${elapsed}s; restarting and retrying." >&2
  rm -f "$output_file"
  restart_adb
done
