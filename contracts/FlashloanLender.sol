pragma solidity ^0.5.16;
import "./CCollateralCapErc20.sol";
import "./CErc20.sol";
import "./Comptroller.sol";

interface CERC20Interface {
    function underlying() external view returns (address);
}

contract FlashloanLender is ERC3156FlashLenderInterface {
    /**
     * @notice underlying token to cToken mapping
     */
    mapping(address => address) public underlyingToCToken;

    /**
     * @notice C.R.E.A.M. comptroller address
     */
    address public comptroller;

    address public owner;

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor(address _comptroller, address _owner) public {
        comptroller = _comptroller;
        owner = _owner;
        initialiseUnderlyingMapping();
    }

    function maxFlashLoan(address token) external view returns (uint256) {
        address cToken = underlyingToCToken[token];
        uint256 amount = 0;
        if (cToken != address(0)) {
            amount = CCollateralCapErc20(cToken).maxFlashLoan();
        }
        return amount;
    }

    function flashFee(address token, uint256 amount) external view returns (uint256) {
        address cToken = underlyingToCToken[token];
        require(cToken != address(0), "cannot find cToken of this underlying in the mapping");
        return CCollateralCapErc20(cToken).flashFee(amount);
    }

    function flashLoan(
        ERC3156FlashBorrowerInterface receiver,
        address token,
        uint256 amount,
        bytes calldata data
    ) external returns (bool) {
        address cToken = underlyingToCToken[token];
        require(cToken != address(0), "cannot find cToken of this underlying in the mapping");
        return CCollateralCapErc20(cToken).flashLoan(receiver, msg.sender, amount, data);
    }

    function updateUnderlyingMapping(CToken[] calldata cTokens) external onlyOwner returns (bool) {
        uint256 cTokenLength = cTokens.length;
        for (uint256 i = 0; i < cTokenLength; i++) {
            CToken cToken = cTokens[i];
            address underlying = CErc20(address(cToken)).underlying();
            underlyingToCToken[underlying] = address(cToken);
        }
        return true;
    }

    function removeUnderlyingMapping(CToken[] calldata cTokens) external onlyOwner returns (bool) {
        uint256 cTokenLength = cTokens.length;
        for (uint256 i = 0; i < cTokenLength; i++) {
            CToken cToken = cTokens[i];
            address underlying = CErc20(address(cToken)).underlying();
            underlyingToCToken[underlying] = address(0);
        }
        return true;
    }

    /*** Internal Functions ***/

    function compareStrings(string memory a, string memory b) private pure returns (bool) {
        return (keccak256(abi.encodePacked((a))) == keccak256(abi.encodePacked((b))));
    }

    function initialiseUnderlyingMapping() internal {
        CToken[] memory cTokens = Comptroller(comptroller).getAllMarkets();
        uint256 cTokenLength = cTokens.length;
        for (uint256 i = 0; i < cTokenLength; i++) {
            CToken cToken = cTokens[i];
            if (compareStrings(cToken.symbol(), "crETH")) {
                continue;
            }
            address underlying = CErc20(address(cToken)).underlying();
            underlyingToCToken[underlying] = address(cToken);
        }
    }
}
