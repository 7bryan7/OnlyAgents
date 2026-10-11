// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Review begins at delivery. Disputes freeze settlement until the
/// platform owner decides whether to refund the consumer or pay the provider.
contract TaskEscrow is Ownable, ReentrancyGuard {
    uint256 public constant VERSION = 2;
    uint256 public constant FEE_BPS = 700;
    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_REVISIONS = 3;
    uint256 public timeout;
    address public constant treasury = 0x2e0113c8806c8bFFd9cAA0861a9D1ffFE66E48A8;
    address public deliveryOperator;

    struct Task {
        address consumer;
        address agentOwner;
        uint256 amount;
        uint256 createdAt;
        bool completed;
        bool released;
        uint256 deliveredAt;
        uint256 reviewDeadline;
        bytes32 outputHash;
        bool disputed;
        bool refunded;
        uint256 revisions;
    }

    uint256 public taskCount;
    uint256 public lockedBalance;
    mapping(uint256 => Task) public tasks;

    event TaskCreated(uint256 indexed taskId, address indexed consumer, address indexed agentOwner, uint256 amount);
    event TaskDelivered(uint256 indexed taskId, bytes32 outputHash, uint256 deliveredAt, uint256 reviewDeadline);
    event RevisionHeld(uint256 indexed taskId, uint256 revision);
    event TaskDisputed(uint256 indexed taskId, address indexed consumer, bytes32 reasonHash);
    event DisputeResolved(uint256 indexed taskId, bool refundConsumer);
    event TaskRefunded(uint256 indexed taskId, address indexed consumer, uint256 amount);
    event TaskPaid(uint256 indexed taskId, address indexed agentOwner, uint256 payout, uint256 fee);
    event TaskReleased(uint256 indexed taskId, address indexed agentOwner, uint256 payout, uint256 fee);
    event DeliveryOperatorChanged(address indexed operator);

    constructor(address treasury_, uint256 reviewPeriod_, address deliveryOperator_) Ownable(treasury) {
        require(treasury_ == treasury, "TaskEscrow: fixed platform treasury");
        require(deliveryOperator_ != address(0), "TaskEscrow: zero operator");
        require(reviewPeriod_ > 0, "TaskEscrow: zero review period");
        timeout = reviewPeriod_;
        deliveryOperator = deliveryOperator_;
    }

    modifier onlyOperator() {
        require(msg.sender == deliveryOperator, "TaskEscrow: not operator");
        _;
    }

    function _openTask(uint256 taskId) internal view returns (Task storage t) {
        t = tasks[taskId];
        require(t.consumer != address(0), "TaskEscrow: unknown task");
        require(!t.completed && !t.released && !t.refunded, "TaskEscrow: already settled");
    }

    function createTask(address agentOwner, uint256 amount) external payable nonReentrant returns (uint256 taskId) {
        require(agentOwner != address(0), "TaskEscrow: zero agent owner");
        require(amount > 0, "TaskEscrow: zero amount");
        require(msg.value >= amount, "TaskEscrow: insufficient payment");
        taskId = ++taskCount;
        lockedBalance += amount;
        Task storage t = tasks[taskId];
        t.consumer = msg.sender;
        t.agentOwner = agentOwner;
        t.amount = amount;
        t.createdAt = block.timestamp;
        uint256 refund = msg.value - amount;
        if (refund > 0) {
            (bool ok, ) = msg.sender.call{value: refund}("");
            require(ok, "TaskEscrow: refund failed");
        }
        emit TaskCreated(taskId, msg.sender, agentOwner, amount);
    }

    function markDelivered(uint256 taskId, bytes32 outputHash) external onlyOperator {
        Task storage t = _openTask(taskId);
        require(!t.disputed, "TaskEscrow: disputed");
        require(t.deliveredAt == 0, "TaskEscrow: already delivered");
        require(outputHash != bytes32(0), "TaskEscrow: empty output hash");
        t.deliveredAt = block.timestamp;
        t.reviewDeadline = block.timestamp + timeout;
        t.outputHash = outputHash;
        emit TaskDelivered(taskId, outputHash, t.deliveredAt, t.reviewDeadline);
    }

    /// @notice Freeze the old delivery before the server starts a revision.
    function holdRevision(uint256 taskId) external onlyOperator {
        Task storage t = _openTask(taskId);
        require(!t.disputed, "TaskEscrow: disputed");
        require(t.deliveredAt != 0, "TaskEscrow: not delivered");
        require(block.timestamp < t.reviewDeadline, "TaskEscrow: review expired");
        require(t.revisions < MAX_REVISIONS, "TaskEscrow: maximum revisions");
        t.revisions++;
        t.deliveredAt = 0;
        t.reviewDeadline = 0;
        t.outputHash = bytes32(0);
        emit RevisionHeld(taskId, t.revisions);
    }

    function completeTask(uint256 taskId) external nonReentrant {
        Task storage t = _openTask(taskId);
        require(t.consumer == msg.sender, "TaskEscrow: not consumer");
        require(!t.disputed, "TaskEscrow: disputed");
        require(t.deliveredAt != 0, "TaskEscrow: not delivered");
        t.completed = true;
        _settle(taskId, t);
    }

    function releaseTask(uint256 taskId) external nonReentrant {
        Task storage t = _openTask(taskId);
        require(!t.disputed, "TaskEscrow: disputed");
        require(t.deliveredAt != 0, "TaskEscrow: not delivered");
        require(block.timestamp >= t.reviewDeadline, "TaskEscrow: not yet expired");
        t.released = true;
        _settle(taskId, t);
    }

    /// @notice Consumer's transaction freezes payment before any AI review.
    /// Undelivered (including failed) work can also be disputed.
    function openDispute(uint256 taskId, bytes32 reasonHash) external {
        Task storage t = _openTask(taskId);
        require(t.consumer == msg.sender, "TaskEscrow: not consumer");
        require(!t.disputed, "TaskEscrow: already disputed");
        require(t.deliveredAt == 0 || block.timestamp < t.reviewDeadline, "TaskEscrow: review expired");
        require(reasonHash != bytes32(0), "TaskEscrow: empty reason hash");
        t.disputed = true;
        emit TaskDisputed(taskId, msg.sender, reasonHash);
    }

    /// @notice Only the platform owner can resolve, never the delivery operator.
    function resolveDispute(uint256 taskId, bool refundConsumer) external onlyOwner nonReentrant {
        Task storage t = _openTask(taskId);
        require(t.disputed, "TaskEscrow: not disputed");
        t.disputed = false;
        if (refundConsumer) {
            t.refunded = true;
            lockedBalance -= t.amount;
            (bool ok, ) = t.consumer.call{value: t.amount}("");
            require(ok, "TaskEscrow: refund failed");
            emit TaskRefunded(taskId, t.consumer, t.amount);
        } else {
            t.completed = true;
            _settle(taskId, t);
        }
        emit DisputeResolved(taskId, refundConsumer);
    }

    function _settle(uint256 taskId, Task storage t) internal {
        lockedBalance -= t.amount;
        uint256 fee = (t.amount * FEE_BPS) / BPS;
        uint256 payout = t.amount - fee;
        (bool okOwner, ) = t.agentOwner.call{value: payout}("");
        require(okOwner, "TaskEscrow: payout failed");
        (bool okFee, ) = treasury.call{value: fee}("");
        require(okFee, "TaskEscrow: fee transfer failed");
        if (t.released) emit TaskReleased(taskId, t.agentOwner, payout, fee);
        else emit TaskPaid(taskId, t.agentOwner, payout, fee);
    }

    function setDeliveryOperator(address operator_) external onlyOwner {
        require(operator_ != address(0), "TaskEscrow: zero operator");
        deliveryOperator = operator_;
        emit DeliveryOperatorChanged(operator_);
    }

    /// @notice Affects future deliveries; existing deadlines do not change.
    function setTimeout(uint256 timeout_) external onlyOwner {
        require(timeout_ > 0, "TaskEscrow: zero review period");
        timeout = timeout_;
    }

    function withdraw() external onlyOwner nonReentrant {
        (bool ok, ) = treasury.call{value: address(this).balance - lockedBalance}("");
        require(ok, "TaskEscrow: withdraw failed");
    }
}
