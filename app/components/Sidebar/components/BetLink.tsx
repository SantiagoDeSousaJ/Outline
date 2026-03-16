import { observer } from "mobx-react";
import { StarredIcon } from "outline-icons";
import { useTranslation } from "react-i18next";
import { betPath } from "~/utils/routeHelpers";
import SidebarLink from "./SidebarLink";

function BetLink() {
  const { t } = useTranslation();

  return (
    <SidebarLink
      to={betPath()}
      icon={<StarredIcon />}
      exact={false}
      label={t("Bet")}
      depth={0}
    />
  );
}

export default observer(BetLink);

