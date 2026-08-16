const {
  SlashCommandBuilder,
  ContainerBuilder,
  StringSelectMenuBuilder,
  MessageFlags,
} = require('discord.js');
const config = require('../config.json');
const { isAdmin } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-panel')
    .setDescription('Post the ticket creation panel with a category dropdown'),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId('ticket_category_select')
      .setPlaceholder('Select a ticket category…')
      .addOptions(
        config.categories.map((cat) => ({
          label: cat.label,
          description: (cat.description || '').slice(0, 100),
          value: cat.id,
          emoji: cat.emoji || undefined,
        }))
      );

    const titleText = config.panel.title ? `## ${config.panel.title}\n` : '';
    const footerText = config.panel.footer ? `\n-# ${config.panel.footer}` : '';
    const bodyText = `${titleText}${config.panel.description}${footerText}`;

    const container = new ContainerBuilder().setAccentColor(config.panel.color || '#5865F2');

    const hasLogo = config.logoUrl && !config.logoUrl.startsWith('PUT_');
    if (hasLogo) {
      container.addSectionComponents((section) =>
        section
          .addTextDisplayComponents((td) => td.setContent(bodyText))
          .setThumbnailAccessory((thumb) => thumb.setURL(config.logoUrl))
      );
    } else {
      container.addTextDisplayComponents((td) => td.setContent(bodyText));
    }

    container.addActionRowComponents((row) => row.addComponents(menu));

    await interaction.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
    await interaction.reply({ content: 'Ticket panel posted.', ephemeral: true });
  },
};
