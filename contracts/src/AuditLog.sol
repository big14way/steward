// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AuditLog {
    enum Action { HOLD, PAY, PARTIAL, ESCALATE, SWEEP, REDEEM, SCREEN_FAIL }
    event Decision(address indexed agent, uint256 indexed allowanceId, bytes32 indexed decisionHash, Action action, uint128 amount, uint64 blockNumber);

    function record(uint256 allowanceId, bytes32 decisionHash, Action action, uint128 amount) external {
        emit Decision(msg.sender, allowanceId, decisionHash, action, amount, uint64(block.number));
    }
}
