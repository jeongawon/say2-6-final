"""
AI 판단 근거(rationale) 한글화 테스트 스크립트

수정된 hybrid_decision_engine.py의 rationale이 제대로 한글로 출력되는지 테스트합니다.
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.agent.hybrid_decision_engine import HybridDecisionEngine


def print_section(title):
    """Print section header"""
    print("\n" + "="*80)
    print(f"  {title}")
    print("="*80 + "\n")


def test_initial_decision():
    """테스트 1: 초기 검사 선택 (CC Map 없이)"""
    print_section("테스트 1: 초기 검사 선택")
    
    patient = {
        'age': 65,
        'gender': 'M',
        'chief_complaint': '흉통'
    }
    
    engine = HybridDecisionEngine(
        patient=patient,
        modalities_completed=[],
        inference_results=[],
        iteration=1,
        ml_models_initial=None,  # No ML models for fallback test
        ml_models_followup=None,
        ml_metadata_initial=None,
        ml_metadata_followup=None,
        cc_map=None,
        feature_extractor=None
    )
    
    decision = engine.decide()
    
    print(f"결정: {decision['decision']}")
    print(f"다음 검사: {decision.get('next_modalities', [])}")
    print(f"\n{decision['rationale']}")


def test_ml_predictions():
    """테스트 2: ML 예측 결과 해석"""
    print_section("테스트 2: ML 예측 결과 해석 (시뮬레이션)")
    
    # Simulate different ML prediction scenarios
    test_cases = [
        {
            'name': 'STOP (검사 종료)',
            'predictions': {'stop': 0.65, 'need_reasoning': 0.20, 'order_ecg': 0.10, 'order_cxr': 0.03, 'order_lab': 0.02},
            'completed': ['ECG', 'LAB']
        },
        {
            'name': 'NEED_REASONING (복합 증례)',
            'predictions': {'stop': 0.25, 'need_reasoning': 0.55, 'order_ecg': 0.10, 'order_cxr': 0.08, 'order_lab': 0.02},
            'completed': ['ECG', 'CXR', 'LAB']
        },
        {
            'name': 'ORDER_ECG (심전도 추가)',
            'predictions': {'stop': 0.20, 'need_reasoning': 0.15, 'order_ecg': 0.45, 'order_cxr': 0.15, 'order_lab': 0.05},
            'completed': ['CXR']
        },
        {
            'name': 'ORDER_CXR (흉부 X-ray 추가)',
            'predictions': {'stop': 0.18, 'need_reasoning': 0.12, 'order_ecg': 0.10, 'order_cxr': 0.48, 'order_lab': 0.12},
            'completed': ['ECG']
        },
        {
            'name': 'ORDER_LAB (혈액검사 추가)',
            'predictions': {'stop': 0.15, 'need_reasoning': 0.10, 'order_ecg': 0.08, 'order_cxr': 0.12, 'order_lab': 0.55},
            'completed': []
        },
    ]
    
    for test_case in test_cases:
        print(f"\n--- {test_case['name']} ---")
        print(f"완료된 검사: {', '.join(test_case['completed']) if test_case['completed'] else '없음'}")
        print(f"ML 예측: {test_case['predictions']}")
        
        # Create engine instance
        patient = {
            'age': 65,
            'gender': 'M',
            'chief_complaint': '흉통'
        }
        
        engine = HybridDecisionEngine(
            patient=patient,
            modalities_completed=test_case['completed'],
            inference_results=[],
            iteration=1,
            ml_models_initial=None,
            ml_models_followup=None,
            ml_metadata_initial=None,
            ml_metadata_followup=None,
            cc_map=None,
            feature_extractor=None
        )
        
        # Call _interpret_ml_predictions directly
        action, confidence, rationale = engine._interpret_ml_predictions(
            test_case['predictions'],
            is_initial=(len(test_case['completed']) == 0)
        )
        
        print(f"\n결정: {action}")
        print(f"신뢰도: {confidence:.1%}")
        print(f"\n{rationale}")
        print("\n" + "-"*80)


def test_clinical_reasoning():
    """테스트 3: 임상 근거 생성"""
    print_section("테스트 3: 임상 근거 생성")
    
    patient = {
        'age': 65,
        'gender': 'M',
        'chief_complaint': '흉통'
    }
    
    engine = HybridDecisionEngine(
        patient=patient,
        modalities_completed=[],
        inference_results=[],
        iteration=1,
        ml_models_initial=None,
        ml_models_followup=None,
        ml_metadata_initial=None,
        ml_metadata_followup=None,
        cc_map=None,
        feature_extractor=None
    )
    
    test_cases = [
        ('ECG', ['CXR']),
        ('ECG', ['LAB']),
        ('ECG', []),
        ('CXR', ['ECG']),
        ('CXR', ['LAB']),
        ('CXR', []),
        ('LAB', ['ECG', 'CXR']),
        ('LAB', ['ECG']),
        ('LAB', ['CXR']),
        ('LAB', []),
    ]
    
    for modality, completed in test_cases:
        modality_ko = {'ECG': '심전도', 'CXR': '흉부 X-ray', 'LAB': '혈액검사'}.get(modality, modality)
        completed_ko = [{'ECG': '심전도', 'CXR': '흉부 X-ray', 'LAB': '혈액검사'}.get(m, m) for m in completed]
        completed_str = ', '.join(completed_ko) if completed_ko else '없음'
        
        reasoning = engine._get_clinical_reasoning(modality, completed)
        
        print(f"\n{modality_ko} 권고 (완료: {completed_str})")
        print(f"  → {reasoning}")


def test_max_iterations():
    """테스트 4: 최대 반복 횟수 도달"""
    print_section("테스트 4: 최대 반복 횟수 도달")
    
    patient = {
        'age': 65,
        'gender': 'M',
        'chief_complaint': '흉통'
    }
    
    # Simulate iteration 4 (max is 3)
    engine = HybridDecisionEngine(
        patient=patient,
        modalities_completed=['ECG', 'CXR'],
        inference_results=[
            {'modality': 'ECG', 'summary': 'ST elevation'},
            {'modality': 'CXR', 'summary': 'Cardiomegaly'}
        ],
        iteration=4,  # Exceeds MAX_ITERATIONS (3)
        ml_models_initial=None,
        ml_models_followup=None,
        ml_metadata_initial=None,
        ml_metadata_followup=None,
        cc_map=None,
        feature_extractor=None
    )
    
    decision = engine.decide()
    
    print(f"반복 횟수: {engine.iteration} (최대: {engine.MAX_ITERATIONS})")
    print(f"결정: {decision['decision']}")
    print(f"\n{decision['rationale']}")


def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("  AI 판단 근거(Rationale) 한글화 테스트")
    print("="*80)
    
    try:
        test_initial_decision()
        test_ml_predictions()
        test_clinical_reasoning()
        test_max_iterations()
        
        print("\n" + "="*80)
        print("  ✅ 모든 테스트 완료!")
        print("="*80 + "\n")
        
    except Exception as e:
        print(f"\n❌ 테스트 실패: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0


if __name__ == '__main__':
    sys.exit(main())
