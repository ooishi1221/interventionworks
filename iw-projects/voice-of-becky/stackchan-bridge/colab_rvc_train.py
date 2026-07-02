"""
Colab RVC Training Script
colab run で実行: colab run colab_rvc_train.py
"""
import subprocess
import sys
import os

MODEL_NAME = "ado_test"
SAMPLE_RATE = 40000
EPOCHS = 200
BATCH_SIZE = 4

def run(cmd, **kwargs):
    print(f">>> {cmd}")
    result = subprocess.run(cmd, shell=True, text=True, **kwargs)
    if result.returncode != 0:
        print(f"ERROR: {result.stderr}")
        sys.exit(1)
    return result

# Applio インストール
print("=== Applio セットアップ ===")
run("git clone https://github.com/IAHispano/Applio.git /content/Applio")
os.chdir("/content/Applio")
run("pip install -q -r requirements.txt")

# データセット配置（upload 済みの前提）
dataset_dir = f"/content/datasets/{MODEL_NAME}"
os.makedirs(dataset_dir, exist_ok=True)

# Preprocess
print(f"\n=== Preprocess (sr={SAMPLE_RATE}) ===")
run(f"python core.py preprocess --model_name {MODEL_NAME} --dataset_path {dataset_dir} --sample_rate {SAMPLE_RATE} --cpu_cores 2")

# Feature extraction
print("\n=== Feature Extract ===")
run(f"python core.py extract --model_name {MODEL_NAME} --rvc_version v2 --f0_method rmvpe --pitch_guidance True --hop_length 128 --cpu_cores 2 --gpu 0 --sample_rate {SAMPLE_RATE}")

# Train
print(f"\n=== Train ({EPOCHS} epochs) ===")
run(f"python core.py train --model_name {MODEL_NAME} --rvc_version v2 --save_every_epoch 50 --save_only_latest True --epochs {EPOCHS} --batch_size {BATCH_SIZE} --gpu 0 --pitch_guidance True --sample_rate {SAMPLE_RATE} --overtraining_detector False")

print(f"\n=== 完了: /content/Applio/logs/{MODEL_NAME}/ ===")
