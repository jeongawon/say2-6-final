"""
chest-svc-v2 임계값 중앙 관리 (Single Source of Truth).
기존 chest-svc/thresholds.py에서 6개 질환 + UNet 상수만 발췌.
"""

# ====================================================================
# 1. DenseNet 6개 ���환 정의 (인덱스 + Youden 최적화 임계값)
# ====================================================================
# DenseNet ONNX 출력 인덱스 (CheXpert 14-label 표준 순서):
#   0=Atelectasis, 1=Cardiomegaly, 2=Consolidation, 3=Edema,
#   4=Enlarged_Cardiomediastinum, 5=Fracture, 6=Lung_Lesion,
#   7=Lung_Opacity, 8=No_Finding, 9=Pleural_Effusion,
#   10=Pleural_Other, 11=Pneumonia, 12=Pneumothorax,
#   13=Support_Devices
ACTIVE_DISEASES = {
    "Cardiomegaly":              {"index": 1,  "threshold": 0.55},   # 유지 (CTR 교차검증이 Sens 93.6% 보장)
    "Pleural_Effusion":          {"index": 9,  "threshold": 0.45},   # 0.51→0.45 (Expert Youden 최적, Sens 93.3%, Spec 88.8%)
    "Edema":                     {"index": 3,  "threshold": 0.35},   # 0.55→0.35 (Expert Youden 최적, Sens 94.2%, Spec 86.7%)
    "Pneumothorax":              {"index": 12, "threshold": 0.50},   # 유지 (0.50이 Expert Youden 최적)
    "Atelectasis":               {"index": 0,  "threshold": 0.50},   # 유지 (0.50이 Expert Youden 최적)
    "Enlarged_Cardiomediastinum": {"index": 4,  "threshold": 0.45},  # 0.50→0.45 (Expert Youden 최적, Sens 88.1%, Spec 80.6%)
}

# ====================================================================
# 2. CTR (Cardiothoracic Ratio) 상수
# ====================================================================
CTR_NORMAL_UPPER = 0.50             # >0.50 = cardiomegaly
CTR_MODERATE = 0.55                 # >0.55 = moderate
CTR_SEVERE = 0.60                   # >0.60 = severe
CTR_BORDERLINE_LOWER = 0.45        # 0.45~0.50 = borderline

# ====================================================================
# 3. CP angle 상수
# ====================================================================
CP_ANGLE_BLUNTED = 30               # <30° = blunted (effusion)
CP_ANGLE_SMALL = 90                 # ≤90° → small (~200-300mL)
CP_ANGLE_MODERATE = 120             # ≤120° → moderate (~500mL), >120° → large (>1000mL)

# ====================================================================
# 4. Lung area ratio 상수
# ====================================================================
LUNG_RATIO_NORMAL_MIN = 0.85
LUNG_RATIO_NORMAL_MAX = 1.15
LUNG_RATIO_PTX_SEVERE_LOW = 0.60    # <0.60 → severe asymmetry
LUNG_RATIO_PTX_SEVERE_HIGH = 1.67   # >1.67 → severe asymmetry
LUNG_RATIO_PTX_LOCATION_LEFT = 0.70
LUNG_RATIO_PTX_LOCATION_RIGHT = 1.30
LUNG_RATIO_ATEL_LOW = 0.80          # <0.80 → atelectasis
LUNG_RATIO_ATEL_HIGH = 1.25         # >1.25 → atelectasis

# ====================================================================
# 5. DenseNet 전처리 상수
# ====================================================================
DENSENET_INPUT_SIZE = (224, 224)     # H, W
IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)

# ====================================================================
# 6. Edema severity 상수
# ====================================================================
EDEMA_SEVERITY_SEVERE = 0.80        # DenseNet >0.80 → severe
EDEMA_SEVERITY_MODERATE = 0.60      # DenseNet >0.60 → moderate, else mild

# ====================================================================
# 7. Pneumothorax 상수
# ====================================================================
PTX_LARGE = 0.80                    # DenseNet >0.80 → large (severe)
PTX_MODERATE = 0.60                 # DenseNet >0.60 → moderate
PTX_SEG_ASSIST_THRESHOLD = 0.20     # 폐면적 비대칭 + DenseNet >0.20 → 기흉 의심
