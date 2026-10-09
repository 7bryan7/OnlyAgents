// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title OnlyAgent TaskEscrow
/// @notice Locks a consumer's testnet ETH when hiring an agent, then pays out
///         (amount − fee) to the agent owner and the fee to the platform
///         treasury on completion. Auto-release after a timeout lets a task
///         settle even if the consumer disappears.
/// @dev PRD v2 §4.6 — the backend verifies TaskPaid events on-chain before
///      recording any off-chain payout record.
contract TaskEscrow is Ownable {
    /// Platform fee, in basis points (700 = 7%).
    uint256 public constant FEE_BPS = 700;
    uint256 public constant BPS = 10_000;

    /// Default auto-release timeout (24h). Owner-settable.
    uint256 public timeout;

    /// Platform treasury — receives every task fee.
    address public treasury;

    struct Task {
        address consumer;   // who locked the payment
        address agentOwner; // who receives payout on completion
        uint256 amount;     // locked principal (testnet ETH)
        uint256 createdAt;
        bool completed;
        bool released;      // auto-released after timeout
    }

    uint256 public taskCount;
    uint256 public lockedBalance;
    mapping(uint256 => Task) public tasks;

    event TaskCreated(uint256 indexed taskId, address indexed consumer, address indexed agentOwner, uint256 amount);
    event TaskPaid(uint256 indexed taskId, address indexed agentOwner, uint256 payout, uint256 fee);
    event TaskReleased(uint256 indexed taskId, address indexed agentOwner, uint256 payout, uint256 fee);

    constructor(address treasury_, uint256 timeout_) Ownable(msg.sender) {
        require(treasury_ != address(0), "TaskEscrow: zero treasury");
        treasury = treasury_;
        timeout = timeout_;
    }

    /// @notice Lock payment for a hired agent. msg.value must cover `amount`
    ///         (excess is refunded). The consumer is the caller.
    function createTask(address agentOwner, uint256 amount) external payable returns (uint256 taskId) {
        require(agentOwner != address(0), "TaskEscrow: zero agent owner");
        require(amount > 0, "TaskEscrow: zero amount");
        require(msg.value >= amount, "TaskEscrow: insufficient payment");

        taskId = ++taskCount;
        lockedBalance += amount;
        tasks[taskId] = Task({
            consumer: msg.sender,
            agentOwner: agentOwner,
            amount: amount,
            createdAt: block.timestamp,
            completed: false,
            released: false
        });

        uint256 refund = msg.value - amount;
        if (refund > 0) {
            (bool okRefund, ) = msg.sender.call{value: refund}("");
            require(okRefund, "TaskEscrow: refund failed");
        }

        emit TaskCreated(taskId, msg.sender, agentOwner, amount);
    }

    /// @notice Consumer confirms completion → pays agentOwner (amount − fee)
    ///         and sends the fee to treasury.
    function completeTask(uint256 taskId) external {
        Task storage t = tasks[taskId];
        require(t.consumer == msg.sender, "TaskEscrow: not consumer");
        require(!t.completed && !t.released, "TaskEscrow: already settled");

        t.completed = true;
        _settle(taskId, t);
    }

    /// @notice Auto-release after the timeout — anyone can trigger it; the
    ///         agent owner still gets paid (minus fee) so work is never stuck.
    function releaseTask(uint256 taskId) external {
        Task storage t = tasks[taskId];
        require(t.consumer != address(0), "TaskEscrow: unknown task");
        require(!t.completed && !t.released, "TaskEscrow: already settled");
        require(block.timestamp >= t.createdAt + timeout, "TaskEscrow: not yet expired");

        t.released = true;
        _settle(taskId, t);
    }

    function _settle(uint256 taskId, Task storage t) internal {
        lockedBalance -= t.amount;
        uint256 fee = (t.amount * FEE_BPS) / BPS;
        uint256 payout = t.amount - fee;

        (bool okOwner, ) = t.agentOwner.call{value: payout}("");
        require(okOwner, "TaskEscrow: payout failed");
        (bool okFee, ) = treasury.call{value: fee}("");
        require(okFee, "TaskEscrow: fee transfer failed");

        if (t.released) {
            emit TaskReleased(taskId, t.agentOwner, payout, fee);
        } else {
            emit TaskPaid(taskId, t.agentOwner, payout, fee);
        }
    }

    /// @notice Owner can redirect the treasury (e.g. to a multisig).
    function setTreasury(address treasury_) external onlyOwner {
        require(treasury_ != address(0), "TaskEscrow: zero treasury");
        treasury = treasury_;
    }

    function setTimeout(uint256 timeout_) external onlyOwner {
        timeout = timeout_;
    }

    /// @notice Withdraw any accidental direct ETH sent to the contract.
    function withdraw() external onlyOwner {
        (bool ok, ) = treasury.call{value: address(this).balance - lockedBalance}("");
        require(ok, "TaskEscrow: withdraw failed");
    }
}
