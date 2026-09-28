// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title AllowanceManager — capped, periodic, expiring, revocable spending delegation for agents on Arc.
/// @dev All amounts are USDC ERC-20 units (6 decimals). Never mix with native 18-dp balance.
contract AllowanceManager {
    using SafeERC20 for IERC20;

    struct Allowance {
        address owner;
        address agent;
        address payee;
        uint128 capPerPeriod;
        uint128 perTxCap;
        uint64  period;        // seconds; 0 = no reset
        uint64  periodStart;
        uint64  expiry;        // 0 = none
        uint128 spentThisPeriod;
        uint128 funded;
        bool    revoked;
    }

    IERC20 public immutable USDC;
    uint256 public nextId;
    mapping(uint256 => Allowance) public allowances;
    mapping(bytes32 => bool) public usedDecision; // one decisionHash pays once

    event Created(uint256 indexed id, address indexed owner, address indexed agent, address payee, uint128 capPerPeriod, uint128 perTxCap, uint64 period, uint64 expiry);
    event Funded(uint256 indexed id, uint128 amount);
    event Paid(uint256 indexed id, uint128 amount, bytes32 indexed decisionHash, string memo);
    event Escalated(uint256 indexed id, uint128 amount, bytes32 indexed decisionHash, string reason);
    event Approved(uint256 indexed id, uint128 amount, bytes32 indexed decisionHash);
    event Revoked(uint256 indexed id, uint128 refunded);

    error NotOwner(); error NotAgent(); error IsRevoked(); error Expired();
    error OverPerTx(); error OverPeriod(); error Underfunded(); error DecisionUsed(); error ZeroPayee();

    constructor(address usdc) { USDC = IERC20(usdc); }

    function create(address agent, address payee, uint128 capPerPeriod, uint128 perTxCap, uint64 period, uint64 expiry)
        external returns (uint256 id)
    {
        if (payee == address(0)) revert ZeroPayee();
        id = nextId++;
        allowances[id] = Allowance({
            owner: msg.sender, agent: agent, payee: payee,
            capPerPeriod: capPerPeriod, perTxCap: perTxCap,
            period: period, periodStart: uint64(block.timestamp), expiry: expiry,
            spentThisPeriod: 0, funded: 0, revoked: false
        });
        emit Created(id, msg.sender, agent, payee, capPerPeriod, perTxCap, period, expiry);
    }

    function fund(uint256 id, uint128 amount) external {
        Allowance storage a = allowances[id];
        if (msg.sender != a.owner) revert NotOwner();
        USDC.safeTransferFrom(msg.sender, address(this), amount);
        a.funded += amount;
        emit Funded(id, amount);
    }

    /// @notice Agent pays inside policy. decisionHash = keccak256(canonical JSON of the off-chain decision record).
    function pay(uint256 id, uint128 amount, bytes32 decisionHash, string calldata memo) external {
        Allowance storage a = allowances[id];
        if (msg.sender != a.agent) revert NotAgent();
        if (a.revoked) revert IsRevoked();
        if (a.expiry != 0 && block.timestamp > a.expiry) revert Expired();
        if (usedDecision[decisionHash]) revert DecisionUsed();
        _roll(a);
        if (amount > a.perTxCap) revert OverPerTx();
        if (a.spentThisPeriod + amount > a.capPerPeriod) revert OverPeriod();
        if (a.funded < amount) revert Underfunded();
        usedDecision[decisionHash] = true;
        a.spentThisPeriod += amount;
        a.funded -= amount;
        USDC.safeTransfer(a.payee, amount);
        emit Paid(id, amount, decisionHash, memo);
    }

    /// @notice Agent records an over-policy request. Nothing moves.
    function escalate(uint256 id, uint128 amount, bytes32 decisionHash, string calldata reason) external {
        if (msg.sender != allowances[id].agent) revert NotAgent();
        emit Escalated(id, amount, decisionHash, reason);
    }

    /// @notice Owner approves an escalated amount. Bypasses caps, not funding, not revocation.
    function approveAndPay(uint256 id, uint128 amount, bytes32 decisionHash) external {
        Allowance storage a = allowances[id];
        if (msg.sender != a.owner) revert NotOwner();
        if (a.revoked) revert IsRevoked();
        if (usedDecision[decisionHash]) revert DecisionUsed();
        if (a.funded < amount) revert Underfunded();
        usedDecision[decisionHash] = true;
        a.funded -= amount;
        USDC.safeTransfer(a.payee, amount);
        emit Approved(id, amount, decisionHash);
    }

    function revoke(uint256 id) external {
        Allowance storage a = allowances[id];
        if (msg.sender != a.owner) revert NotOwner();
        a.revoked = true;
        uint128 refund = a.funded; a.funded = 0;
        if (refund > 0) USDC.safeTransfer(a.owner, refund);
        emit Revoked(id, refund);
    }

    function _roll(Allowance storage a) internal {
        if (a.period == 0) return;
        if (block.timestamp >= a.periodStart + a.period) {
            uint64 elapsed = (uint64(block.timestamp) - a.periodStart) / a.period;
            a.periodStart += elapsed * a.period;
            a.spentThisPeriod = 0;
        }
    }
}
