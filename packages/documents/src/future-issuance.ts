/** Architecture only. No implementation, issuance route, signing or storage activation exists. */
export interface FutureMarksheetIssuancePlan {
  readonly universityPolicyApprovalReference: string;
  readonly approvedTemplate: {
    readonly id: string;
    readonly version: number;
    readonly approvalReference: string;
  };
  readonly publicationReceiptReference: string;
  readonly immutableResultSnapshotReference: string;
  readonly authorizedIssuerReference: string;
  readonly signingAuthorizationReference: string;
  readonly recipientRegistrationReference: string;
}
/** References are not authorization proofs; a future service must verify each server-side. */
export interface FutureIssuanceReadinessVerifier {
  verify(plan: FutureMarksheetIssuancePlan): Promise<void>;
}
