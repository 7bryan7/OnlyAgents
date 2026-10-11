// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title OnlyAgent AgentFactory
/// @notice Mints user-owned custom agents on Base Sepolia for a fixed testnet
///         fee. Each agent is an ERC-721 so ownership/transfer is native.
///         Collected fees route to the platform treasury.
/// @dev PRD v2 §4.3 — the backend verifies the mint transaction on-chain
///      (receipt + AgentMinted event) before persisting the agent; it never
///      trusts a client-submitted txHash.
contract AgentFactory is ERC721, Ownable {
    /// Fixed testnet mint fee (0.001 ETH).
    uint256 public constant MINT_FEE = 0.001 ether;

    /// Platform treasury — receives every mint fee.
    address public constant treasury = 0x2e0113c8806c8bFFd9cAA0861a9D1ffFE66E48A8;

    /// Next token id (1-based).
    uint256 private _nextTokenId = 1;

    /// metadataHash → tokenId (prevents duplicate metadata mints).
    mapping(bytes32 => uint256) public tokenByMetadata;

    event AgentMinted(address indexed owner, bytes32 indexed metadataHash, uint256 indexed tokenId);

    constructor(address treasury_) ERC721("OnlyAgent", "OA") Ownable(treasury) {
        require(treasury_ == treasury, "AgentFactory: fixed platform treasury");
    }

    /// @notice Mint a custom agent. metadataHash is a keccak256 of the agent
    ///         profile (name, persona prompt, specialty) computed off-chain.
    /// @dev Requires msg.value >= MINT_FEE; excess is refunded.
    function mintAgent(bytes32 metadataHash) external payable returns (uint256 tokenId) {
        require(msg.value >= MINT_FEE, "AgentFactory: insufficient fee");
        require(tokenByMetadata[metadataHash] == 0, "AgentFactory: metadata already minted");

        tokenId = _nextTokenId++;
        tokenByMetadata[metadataHash] = tokenId;
        _safeMint(msg.sender, tokenId);

        // Route the fee to treasury; refund any excess.
        uint256 refund = msg.value - MINT_FEE;
        if (refund > 0) {
            (bool okRefund, ) = msg.sender.call{value: refund}("");
            require(okRefund, "AgentFactory: refund failed");
        }
        (bool okFee, ) = treasury.call{value: MINT_FEE}("");
        require(okFee, "AgentFactory: fee transfer failed");

        emit AgentMinted(msg.sender, metadataHash, tokenId);
    }

    /// @notice Withdraw any accidental direct ETH sent to the contract.
    function withdraw() external onlyOwner {
        (bool ok, ) = treasury.call{value: address(this).balance}("");
        require(ok, "AgentFactory: withdraw failed");
    }
}
