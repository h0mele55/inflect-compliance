import { computeAnswerPoints, computeAssessmentScore, scoreToRiskRating } from '../../src/app-layer/services/vendor-scoring';

describe('Vendor Scoring', () => {
    describe('computeAnswerPoints', () => {
        const yesNoQ = { id: 'q1', weight: 2, riskPointsJson: { YES: 0, NO: 8 } };

        it('maps boolean true → YES → 0 points', () => {
            expect(computeAnswerPoints(yesNoQ, { questionId: 'q1', answerJson: true })).toBe(0);
        });

        it('maps boolean false → NO → 8 points', () => {
            expect(computeAnswerPoints(yesNoQ, { questionId: 'q1', answerJson: false })).toBe(8);
        });

        it('maps string "YES" → 0 points', () => {
            expect(computeAnswerPoints(yesNoQ, { questionId: 'q1', answerJson: 'YES' })).toBe(0);
        });

        it('maps string "no" (case-insensitive) → 8 points', () => {
            expect(computeAnswerPoints(yesNoQ, { questionId: 'q1', answerJson: 'no' })).toBe(8);
        });

        it('returns 0 for unknown answer', () => {
            expect(computeAnswerPoints(yesNoQ, { questionId: 'q1', answerJson: 'MAYBE' })).toBe(0);
        });

        it('returns 0 when no riskPointsJson', () => {
            const q = { id: 'q2', weight: 1, riskPointsJson: null };
            expect(computeAnswerPoints(q, { questionId: 'q2', answerJson: 'YES' })).toBe(0);
        });

        it('handles object answer with .value', () => {
            const q = { id: 'q3', weight: 1, riskPointsJson: { 'HIGH': 7 } };
            expect(computeAnswerPoints(q, { questionId: 'q3', answerJson: { value: 'high' } })).toBe(7);
        });

        it('handles number answer', () => {
            const q = { id: 'q4', weight: 1, riskPointsJson: { '5': 3 } };
            expect(computeAnswerPoints(q, { questionId: 'q4', answerJson: 5 })).toBe(3);
        });
    });

    describe('computeAssessmentScore', () => {
        const questions = [
            { id: 'q1', weight: 2, riskPointsJson: { YES: 0, NO: 8 } },
            { id: 'q2', weight: 1, riskPointsJson: { YES: 0, NO: 10 } },
            { id: 'q3', weight: 3, riskPointsJson: { YES: 0, NO: 5 } },
        ];

        it('scores 0% when all answers are YES (low risk)', () => {
            const answers = [
                { questionId: 'q1', answerJson: true },
                { questionId: 'q2', answerJson: true },
                { questionId: 'q3', answerJson: true },
            ];
            const { score, percentScore } = computeAssessmentScore(questions, answers);
            expect(score).toBe(0);
            expect(percentScore).toBe(0);
        });

        it('scores high when all answers are NO (high risk)', () => {
            const answers = [
                { questionId: 'q1', answerJson: false }, // 8 * 2 = 16
                { questionId: 'q2', answerJson: false }, // 10 * 1 = 10
                { questionId: 'q3', answerJson: false }, // 5 * 3 = 15
            ];
            const { score } = computeAssessmentScore(questions, answers);
            expect(score).toBe(41); // 16 + 10 + 15
        });

        it('handles partial answers', () => {
            const answers = [{ questionId: 'q1', answerJson: false }]; // 8 * 2 = 16
            const { score } = computeAssessmentScore(questions, answers);
            expect(score).toBe(16);
        });

        it('returns 0 with no answers', () => {
            const { score, percentScore } = computeAssessmentScore(questions, []);
            expect(score).toBe(0);
            expect(percentScore).toBe(0);
        });
    });

    describe('scoreToRiskRating', () => {
        it('LOW for 0-25%', () => {
            expect(scoreToRiskRating(0)).toBe('LOW');
            expect(scoreToRiskRating(25)).toBe('LOW');
        });

        it('MEDIUM for 26-50%', () => {
            expect(scoreToRiskRating(26)).toBe('MEDIUM');
            expect(scoreToRiskRating(50)).toBe('MEDIUM');
        });

        it('HIGH for 51-75%', () => {
            expect(scoreToRiskRating(51)).toBe('HIGH');
            expect(scoreToRiskRating(75)).toBe('HIGH');
        });

        it('CRITICAL for 76-100%', () => {
            expect(scoreToRiskRating(76)).toBe('CRITICAL');
            expect(scoreToRiskRating(100)).toBe('CRITICAL');
        });
    });
});
