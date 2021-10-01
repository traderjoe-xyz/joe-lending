// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.5.16;
import "./JCollateralCapErc20.sol";
import "./JErc20.sol";
import "./Joetroller.sol";

interface CERC20Interface {
    function underlying() external view returns (address);
}

contract FlashloanLender is ERC3156FlashLenderInterface {
    /**
     * @notice underlying token to jToken mapping
     */
    mapping(address => address) public underlyingToJToken;

    /**
     * @notice C.R.E.A.M. joetroller address
     */
    address payable public joetroller;

    address public owner;

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor(address payable _joetroller, address _owner) public {
        joetroller = _joetroller;
        owner = _owner;
        initialiseUnderlyingMapping();
    }

    function maxFlashLoan(address token) external view returns (uint256) {
        address jToken = underlyingToJToken[token];
        uint256 amount = 0;
        if (jToken != address(0)) {
            amount = JCollateralCapErc20(jToken).maxFlashLoan();
        }
        return amount;
    }

    function flashFee(address token, uint256 amount) external view returns (uint256) {
        address jToken = underlyingToJToken[token];
        require(jToken != address(0), "cannot find jToken of this underlying in the mapping");
        return JCollateralCapErc20(jToken).flashFee(amount);
    }

    function flashLoan(
        ERC3156FlashBorrowerInterface receiver,
        address token,
        uint256 amount,
        bytes calldata data
    ) external returns (bool) {
        address jToken = underlyingToJToken[token];
        require(jToken != address(0), "cannot find jToken of this underlying in the mapping");
        return JCollateralCapErc20(jToken).flashLoan(receiver, msg.sender, amount, data);
    }

    function updateUnderlyingMapping(JToken[] calldata jTokens) external onlyOwner returns (bool) {
        uint256 jTokenLength = jTokens.length;
        for (uint256 i = 0; i < jTokenLength; i++) {
            JToken jToken = jTokens[i];
            address underlying = JErc20(address(jToken)).underlying();
            underlyingToJToken[underlying] = address(jToken);
        }
        return true;
    }

    function removeUnderlyingMapping(JToken[] calldata jTokens) external onlyOwner returns (bool) {
        uint256 jTokenLength = jTokens.length;
        for (uint256 i = 0; i < jTokenLength; i++) {
            JToken jToken = jTokens[i];
            address underlying = JErc20(address(jToken)).underlying();
            underlyingToJToken[underlying] = address(0);
        }
        return true;
    }

    /*** Internal Functions ***/

    function compareStrings(string memory a, string memory b) private pure returns (bool) {
        return (keccak256(abi.encodePacked((a))) == keccak256(abi.encodePacked((b))));
    }

    function initialiseUnderlyingMapping() internal {
        JToken[] memory jTokens = Joetroller(joetroller).getAllMarkets();
        uint256 jTokenLength = jTokens.length;
        for (uint256 i = 0; i < jTokenLength; i++) {
            JToken jToken = jTokens[i];
            if (compareStrings(jToken.symbol(), "crETH")) {
                continue;
            }
            address underlying = JErc20(address(jToken)).underlying();
            underlyingToJToken[underlying] = address(jToken);
        }
    }
}
