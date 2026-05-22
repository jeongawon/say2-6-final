import json, sys

params_file = sys.argv[1]
with open(params_file) as f:
    params = json.load(f)

print(" ".join(f"{p['ParameterKey']}={p['ParameterValue']}" for p in params))
